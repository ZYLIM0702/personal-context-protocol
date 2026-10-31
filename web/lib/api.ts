import type { Disclosed } from "./pcp";
import type { AgentSpec, ChatResult, Conversation, DiscoverResult, ProposeResult, ServerStatus, Turn } from "./types";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, credentials: "same-origin" });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error("Couldn't reach the Personal Context server. Is it running?");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`, res.status);
  return body as T;
}

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export const getStatus = () => request<ServerStatus>("/api/status");

export function propose(args: {
  task: string;
  type?: string;
  passport: Disclosed;
  pcId: string;
  agent?: AgentSpec;
  qlooKey?: string;
  signal?: AbortSignal;
}) {
  const { task, type, passport, pcId, agent, qlooKey, signal } = args;
  const headers: Record<string, string> = qlooKey ? { "x-qloo-api-key": qlooKey } : {};
  const body = { task, passport, pc_id: pcId, ...(type ? { type } : {}), ...(agent ? { agent } : {}) };
  return request<ProposeResult>("/v1/propose", { ...json("POST", body, headers), signal });
}

export function chat(args: {
  messages: { role: "user" | "assistant"; content: string }[];
  passport: Disclosed;
  pcId: string;
  uiPrompt: string;
  recentItems?: { name: string; type: string }[];
  memory: boolean;
  agent?: AgentSpec;
  qlooKey?: string;
  signal?: AbortSignal;
}) {
  const { messages, passport, pcId, uiPrompt, recentItems, memory, agent, qlooKey, signal } = args;
  const headers: Record<string, string> = qlooKey ? { "x-qloo-api-key": qlooKey } : {};
  const body = {
    messages,
    passport,
    pc_id: pcId,
    ui_prompt: uiPrompt,
    ...(memory ? { recent_items: recentItems ?? [] } : { memory: false }),
    ...(agent ? { agent } : {}),
  };
  return request<ChatResult>("/v1/chat", { ...json("POST", body, headers), signal });
}

export function discover(args: { passport: Disclosed; pcId: string; type?: string; qlooKey?: string; signal?: AbortSignal }) {
  const { passport, pcId, type, qlooKey, signal } = args;
  const headers: Record<string, string> = qlooKey ? { "x-qloo-api-key": qlooKey } : {};
  return request<DiscoverResult>("/v1/discover", {
    ...json("POST", { passport, pc_id: pcId, ...(type ? { type } : {}) }, headers),
    signal,
  });
}

export const graphFeedback = (body: { pc_id: string; task: string; type: string; name: string; liked: boolean; shown: string[] }) =>
  request<unknown>("/v1/graph/feedback", json("POST", body));

export const graphSignals = (body: { pc_id: string; signals: { name: string; type: string }[]; vetoes: { name: string; type?: string }[] }) =>
  request<unknown>("/v1/graph/signals", json("POST", body));

export const resetGraph = (pcId: string) => request<unknown>(`/v1/graph/${pcId}`, { method: "DELETE" });

const scoped = (pcId: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers as Record<string, string> | undefined), "x-pc-id": pcId },
});

export const listConversations = (pcId: string) => request<Conversation[]>("/v1/conversations", scoped(pcId));
export const createConversation = (pcId: string, title: string) =>
  request<Conversation>("/v1/conversations", scoped(pcId, json("POST", { title })));
export const getConversation = (pcId: string, id: string) => request<Conversation>(`/v1/conversations/${id}`, scoped(pcId));
export const saveConversation = (pcId: string, id: string, body: { title?: string; messages: Turn[] }) =>
  request<Conversation>(`/v1/conversations/${id}`, scoped(pcId, json("PUT", body)));
export const deleteConversation = (pcId: string, id: string) =>
  request<{ deleted: boolean }>(`/v1/conversations/${id}`, scoped(pcId, { method: "DELETE" }));

export type GraphSnapshot = {
  nodes: { id: string; name: string; type: string | null; score: number; vetoed?: boolean }[];
  edges: { a: string; b: string; kind: string; w: number }[];
  totals: { nodes: number; edges: number };
};

export const getGraph = (pcId: string) => request<GraphSnapshot>(`/v1/graph/${pcId}`);

export const putVault = (id: string, sealed: unknown) => request<{ stored: boolean }>(`/v1/vault/${id}`, json("PUT", sealed));
export const getVault = (id: string) => request<unknown>(`/v1/vault/${id}`);
export const deleteVault = (id: string) => request<unknown>(`/v1/vault/${id}`, { method: "DELETE" });
