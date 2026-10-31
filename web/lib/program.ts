import { agentLabel, typeOne } from "./format";
import type { AgentTurn, Turn } from "./types";

type Lang = null | undefined | string | number | boolean | Lang[] | { [key: string]: Lang };

export function lang(value: Lang): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(lang).join(", ")}]`;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return `{${entries.map(([k, v]) => `${k}: ${lang(v)}`).join(", ")}}`;
}

function errorText(error: AgentTurn["result"]["qloo"]["error"]) {
  if (!error) return null;
  return typeof error === "string" ? error : (error.code ?? error.message ?? null);
}

export function agentProgram(turn: AgentTurn): string {
  const r = turn.result;
  const candidates = (r.candidates ?? []).map((c) => ({
    name: c.name,
    prior: c.prior,
    qloo: c.qloo,
    kind: c.qloo_kind ?? null,
    match: c.qloo_match ?? null,
    graph: typeof c.graph === "number" ? c.graph : null,
    why: c.why ?? null,
    because: c.because ?? null,
  }));
  const inferred = r.inferred ? { type: r.inferred.type, confidence: r.inferred.confidence } : null;
  const qloo = {
    status: r.qloo?.status ?? "unknown",
    summary: r.qloo?.summary ?? null,
    error: errorText(r.qloo?.error),
    trace: r.qloo?.correlation_id ?? null,
    unresolved: (r.qloo?.unresolved ?? []).map((u) => ({
      input: u.input,
      field: u.field,
      candidates: (u.candidates ?? []).filter((c): c is string => typeof c === "string"),
    })),
  };
  const intro = r.reply?.trim() || `Here are a few ${typeOne(r.type)} picks for “${turn.task}”, ranked for you.`;
  return [
    "root = Card([intro, picks])",
    `intro = TextContent(${lang(intro)})`,
    `picks = PickList(${lang(r.type)}, ${lang(turn.task)}, ${lang(agentLabel(r))}, ${lang(candidates)}, ${lang(qloo)}, ${lang(inferred)})`,
  ].join("\n");
}

export function errorProgram(text: string): string {
  return [
    "root = Card([note])",
    `note = Callout("warning", "The agent couldn't answer", ${lang(text)})`,
  ].join("\n");
}

export const turnProgram = (turn: Turn) =>
  turn.role === "agent" ? agentProgram(turn) : turn.role === "error" ? errorProgram(turn.text) : turn.text;
