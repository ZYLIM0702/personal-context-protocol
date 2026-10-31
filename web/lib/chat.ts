import { agUIAdapter, type ChatLLM, type ChatStorage, type Message, type Thread } from "@openuidev/react-ui";
import type { RefObject } from "react";
import type { Runtime } from "@/components/AppProvider";
import { uiPrompt } from "@/components/library";
import {
  chat,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
  UUID,
} from "./api";
import { cacheConversation, cachedTurns, cacheList, cacheTurns, uncache } from "./cache";
import { DEMO_CANDIDATES, DEMO_TURNS, LOCAL_DEMO_ID } from "./demo";
import { EXAMPLES } from "./examples";
import { agentLabel, agentSpec } from "./format";
import { disclose, type Candidate } from "./pcp";
import { turnProgram } from "./program";
import type { Conversation, Turn } from "./types";

export const chatEvents = new EventTarget();
export const emitChat = (type: "changed" | "new" | "open" | "selected", id?: string) =>
  chatEvents.dispatchEvent(new CustomEvent(type, { detail: id }));

const turnsByThread = new Map<string, Turn[]>();
const demoIds = new Set<string>([LOCAL_DEMO_ID, ...EXAMPLES.map((e) => e.id)]);

export type AnswerMeta = { kind: "chat" | "picks" | "example" | "error"; label: string; program: boolean };
export const answerMeta = new Map<string, AnswerMeta>();

const LANG = /(^|\n)\s*root\s*=/;
export const looksLikeLang = (text: string) => LANG.test(text);

function metaOf(turn: Turn): AnswerMeta | null {
  if (turn.role === "agent")
    return { kind: "picks", label: `${agentLabel(turn.result)} · Qloo re-rank · ordered on your device`, program: true };
  if (turn.role === "error") return { kind: "error", label: "No answer", program: false };
  if (turn.role !== "assistant") return null;
  if (turn.example) return { kind: "example", label: "Example · authored OpenUI Lang · no API call", program: true };
  const calls = turn.tools?.length ?? 0;
  const tokens = (turn.usage?.input ?? 0) + (turn.usage?.output ?? 0);
  const parts = [
    turn.model ?? "Agent",
    calls ? `${calls} tool call${calls === 1 ? "" : "s"} (Qloo + PC graph)` : "no tool calls",
    tokens ? `${tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens} tokens` : null,
  ].filter(Boolean);
  return { kind: "chat", label: parts.join(" · "), program: turn.format === "openui-lang" && looksLikeLang(turn.text) };
}

function summarize(text: string) {
  if (!looksLikeLang(text)) return text.slice(0, 1200);
  const strings = [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((m) => {
      try {
        return JSON.parse(`"${m[1]}"`) as string;
      } catch {
        return m[1];
      }
    })
    .filter((v) => v.length > 2);
  return `(Showed a card) ${strings.slice(0, 14).join(" · ")}`.slice(0, 700);
}

function lastItems(turns: Turn[]): { items: { name: string; type: string }[]; candidates: Candidate[] } {
  const last = [...turns].reverse().find((t) => t.role === "assistant" || t.role === "agent");
  if (!last) return { items: [], candidates: [] };
  if (last.role === "agent") {
    const type = last.result.type;
    return { items: last.result.candidates.map((c) => ({ name: c.name, type })), candidates: last.result.candidates };
  }
  if (last.role !== "assistant") return { items: [], candidates: [] };
  const items: { name: string; type: string }[] = [];
  const candidates: Candidate[] = [];
  for (const call of last.tools ?? []) {
    const type = call.result?.type ?? call.args?.type ?? "movie";
    for (const r of call.result?.results ?? []) {
      items.push({ name: r.name, type });
      candidates.push({ name: r.name, prior: 1, qloo: r.qloo_affinity ?? null, graph: r.pc_score ?? null });
    }
  }
  return { items, candidates };
}

function history(turns: Turn[]) {
  return turns
    .filter((t) => t.role === "user" || t.role === "assistant" || t.role === "agent")
    .slice(-10)
    .map((t) =>
      t.role === "user"
        ? { role: "user" as const, content: t.text }
        : t.role === "assistant"
          ? { role: "assistant" as const, content: summarize(t.text) }
          : {
              role: "assistant" as const,
              content: `(Showed ${t.result.type} picks) ${t.result.candidates
                .slice(0, 5)
                .map((c) => c.name)
                .join(", ")}`,
            },
    );
}

export const isDemoConversation = (id: string | null | undefined) => Boolean(id && demoIds.has(id));

export function rememberList(list: Conversation[]) {
  for (const c of list) if (c.demo) demoIds.add(c.id);
}

export async function fetchConversations(pcId: string): Promise<Conversation[]> {
  const list = await listConversations(pcId);
  rememberList(list);
  return cacheList(pcId, list);
}

export async function resolveDemoThread(pcId: string): Promise<string> {
  const list = await fetchConversations(pcId).catch(() => []);
  return list.find((c) => c.demo && /friday night movie/i.test(c.title))?.id ?? LOCAL_DEMO_ID;
}

export async function removeConversation(pcId: string, id: string) {
  if (isDemoConversation(id)) return;
  turnsByThread.delete(id);
  uncache(pcId, id);
  if (UUID.test(id)) await deleteConversation(pcId, id).catch(() => undefined);
  emitChat("changed");
}

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
      .join(" ")
      .trim();
  return "";
};

function withDemoReasons(turn: Turn): Turn {
  if (turn.role !== "agent" || turn.result.qloo?.status !== "simulated") return turn;
  const candidates = turn.result.candidates.map((c) => {
    const known = DEMO_CANDIDATES.find((d) => d.name === c.name);
    return known && !c.why ? { ...c, why: known.why, because: c.because ?? known.because } : c;
  });
  return { ...turn, result: { ...turn.result, candidates } };
}

export function toMessages(threadId: string, turns: Turn[]): Message[] {
  return turns.map(withDemoReasons).map((turn, i) => {
    const id = `${threadId}:${i}`;
    if (turn.role === "user") return { id, role: "user", content: turn.text } as Message;
    const meta = metaOf(turn);
    if (meta) answerMeta.set(id, meta);
    return { id, role: "assistant", content: turnProgram(turn) } as Message;
  });
}

function sse(threadId: string, program: string, meta: AnswerMeta | null): Response {
  const runId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  if (meta) answerMeta.set(messageId, meta);
  const events = [
    { type: "RUN_STARTED", threadId, runId },
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: program },
    { type: "TEXT_MESSAGE_END", messageId },
    { type: "RUN_FINISHED", threadId, runId },
  ];
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

async function persist(pcId: string, threadId: string, turns: Turn[]) {
  cacheTurns(pcId, threadId, turns);
  if (UUID.test(threadId) && !isDemoConversation(threadId)) {
    await saveConversation(pcId, threadId, { messages: turns }).catch(() => undefined);
  }
  emitChat("changed");
}

export function createLLM(runtime: RefObject<Runtime>): ChatLLM {
  return {
    streamProtocol: agUIAdapter(),
    async send({ threadId, messages, signal }) {
      const last = [...messages].reverse().find((m) => m.role === "user");
      const text = textOf(last?.content).slice(0, 2000);
      const { passport, settings, qlooKey } = runtime.current;
      runtime.current.pendingType = null;
      const turns = turnsByThread.get(threadId) ?? [];
      const user: Turn = { role: "user", text };
      const memory = settings.memory !== false;
      const recent = lastItems(turns);
      let reply: Turn;
      try {
        const r = await chat({
          messages: history([...turns, user]),
          passport: disclose(passport),
          pcId: passport.id,
          uiPrompt: uiPrompt(),
          recentItems: recent.items.slice(0, 20),
          memory,
          agent: agentSpec(settings),
          qlooKey: qlooKey || undefined,
          signal,
        });
        reply = {
          role: "assistant",
          text: r.reply ?? "",
          format: r.format === "markdown" ? "markdown" : "openui-lang",
          model: r.model,
          provider: r.provider,
          tools: r.tools ?? [],
          usage: r.usage,
        };
        if (memory && r.memory?.length) runtime.current.learn?.(r.memory, recent.candidates);
      } catch (error) {
        if (signal.aborted) throw error;
        reply = { role: "error", text: error instanceof Error ? error.message : String(error) };
      }
      const next = [...turns, user, reply];
      turnsByThread.set(threadId, next);
      void persist(passport.id, threadId, next);
      return sse(threadId, turnProgram(reply), metaOf(reply));
    },
  };
}

export function createStorage(runtime: RefObject<Runtime>): ChatStorage {
  const pcId = () => runtime.current.passport.id;
  return {
    thread: {
      async listThreads() {
        const list = await fetchConversations(pcId()).catch(() => []);
        const threads: Thread[] = list.map((c) => ({ id: c.id, title: c.title, createdAt: c.updated_at }));
        return { threads };
      },
      async createThread(firstMessage) {
        const title = textOf(firstMessage.content).slice(0, 80) || "New chat";
        let conversation: Conversation;
        try {
          conversation = await createConversation(pcId(), title);
        } catch {
          const at = new Date().toISOString();
          conversation = { id: `local-${crypto.randomUUID()}`, title, demo: false, created_at: at, updated_at: at };
        }
        turnsByThread.set(conversation.id, []);
        cacheConversation(pcId(), { ...conversation, messages: undefined }, []);
        emitChat("changed");
        return { id: conversation.id, title: conversation.title, createdAt: conversation.updated_at };
      },
      async getMessages(threadId) {
        const example = EXAMPLES.find((e) => e.id === threadId);
        if (example) {
          turnsByThread.set(threadId, example.turns);
          return toMessages(threadId, example.turns);
        }
        if (threadId === LOCAL_DEMO_ID) {
          turnsByThread.set(threadId, DEMO_TURNS);
          return toMessages(threadId, DEMO_TURNS);
        }
        let turns: Turn[] | null = null;
        if (UUID.test(threadId)) {
          try {
            const c = await getConversation(pcId(), threadId);
            turns = Array.isArray(c.messages) ? c.messages : [];
            if (!c.demo) cacheTurns(pcId(), threadId, turns);
          } catch {
            turns = cachedTurns(pcId(), threadId);
          }
        } else {
          turns = cachedTurns(pcId(), threadId) ?? turnsByThread.get(threadId) ?? [];
        }
        const resolved = turns ?? [];
        turnsByThread.set(threadId, resolved);
        return toMessages(threadId, resolved);
      },
      async updateThread(thread) {
        if (!UUID.test(thread.id) || isDemoConversation(thread.id)) return thread;
        const turns = turnsByThread.get(thread.id) ?? [];
        const c = await saveConversation(pcId(), thread.id, { title: thread.title, messages: turns });
        emitChat("changed");
        return { ...thread, title: c.title, createdAt: c.updated_at, isPending: false };
      },
      async deleteThread(id) {
        await removeConversation(pcId(), id);
      },
    },
  };
}
