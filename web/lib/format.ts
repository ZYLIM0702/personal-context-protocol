import type { AgentSettings, AgentSpec, ProposeResult } from "./types";

export const TYPES = ["movie", "tv_show", "artist", "book", "podcast", "place", "brand", "person"] as const;
export type EntityType = (typeof TYPES)[number];

export const TYPE_LABEL: Record<string, { one: string; many: string; plural: string }> = {
  movie: { one: "movie", many: "Movies", plural: "movies" },
  tv_show: { one: "TV show", many: "TV", plural: "TV shows" },
  artist: { one: "artist", many: "Music", plural: "artists" },
  book: { one: "book", many: "Books", plural: "books" },
  podcast: { one: "podcast", many: "Podcasts", plural: "podcasts" },
  place: { one: "place", many: "Places", plural: "places" },
  brand: { one: "brand", many: "Brands", plural: "brands" },
  person: { one: "person", many: "People", plural: "people" },
};

export const typeOne = (t?: string | null) => (t ? TYPE_LABEL[t]?.one ?? t.replace(/_/g, " ") : "");
export const typeMany = (t?: string | null) => (t ? TYPE_LABEL[t]?.many ?? t.replace(/_/g, " ") : "");

const RULES: [EntityType, RegExp][] = [
  ["podcast", /\bpodcasts?\b/i],
  ["tv_show", /\b(tv|shows?|series|sitcoms?|binge|episodes?)\b/i],
  ["book", /\b(books?|read|reading|novels?|authors?)\b/i],
  ["artist", /\b(music|songs?|albums?|artists?|bands?|listen|playlists?|singers?|drive)\b/i],
  ["movie", /\b(movies?|films?|watch|cinema)\b/i],
  ["place", /\b(restaurants?|places?|travel|visit|city|cities|cafes?|bars?|trips?|eat|dinner|brunch)\b/i],
  ["brand", /\b(brands?|fashion|wear|clothing|shoes|sneakers)\b/i],
  ["person", /\b(people|person|celebrit\w*|actors?|actress\w*)\b/i],
];

export const inferType = (text: string): EntityType | null => RULES.find(([, re]) => re.test(text))?.[0] ?? null;

export const PROVIDERS: Record<string, { name: string; model: string; baseUrl?: string }> = {
  anthropic: { name: "Anthropic", model: "claude-sonnet-5-5" },
  openai: { name: "OpenAI-compatible", model: "gpt-5.6-luna", baseUrl: "https://api.openai.com/v1" },
  ollama: { name: "Local model", model: "llama3.2", baseUrl: "http://localhost:11434/v1" },
};

const PROVIDER_NAME: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  ollama: "Ollama",
  "openai-compatible": "OpenAI-compatible",
};

export const agentLabel = (r: Pick<ProposeResult, "provider" | "model">) =>
  [r.provider ? (PROVIDER_NAME[r.provider] ?? r.provider) : null, r.model].filter(Boolean).join(" · ") || "Agent";

export function agentSpec(s: AgentSettings): AgentSpec | undefined {
  if (s.provider === "default") return undefined;
  const spec: AgentSpec = { provider: s.provider };
  const model = s.model.trim();
  const baseUrl = s.baseUrl.trim();
  if (model) spec.model = model;
  if (baseUrl && PROVIDERS[s.provider]?.baseUrl) spec.baseUrl = baseUrl;
  return spec;
}

export function relativeTime(value: string | number, now = Date.now()) {
  const t = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const pct = (p: number) => (p >= 0.995 ? "100%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
