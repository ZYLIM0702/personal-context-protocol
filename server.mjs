import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { activeSignals, distribution, PROTOCOL } from "./public/sdk/pcp.js";
import { createGraph } from "./lib/graph.mjs";
import { extractPreferences, mentionsOf } from "./lib/memory.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = process.env.PCP_DATA_DIR ? path.resolve(process.env.PCP_DATA_DIR) : path.join(ROOT, "data");
const VAULT = path.join(DATA, "vault");
const DEMO_DB = path.join(DATA, "demo.sqlite");
const WEB_OUT = path.join(ROOT, "web", "out");
const OPENAI_DEFAULT_MODEL = "gpt-5.6-luna";
const DEMO_PAGE_ONLY = process.env.PCP_DEMO_PAGE_ONLY === "1";

try {
  const env = await fs.readFile(path.join(ROOT, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {

}

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const LLM_BASE_URL = process.env.LLM_BASE_URL?.replace(/\/$/, "");
const MODEL = process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || (LLM_BASE_URL ? "llama3.2" : "claude-sonnet-5-5");

const TYPES = ["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show"];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" , ".png": "image/png", ".ico": "image/x-icon", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".map": "application/json"};
const PROVIDERS = ["anthropic", "openai", "ollama"];
const LOOPBACK = ["localhost", "127.0.0.1", "[::1]", "::1"];
const MODEL_NAME = /^[\w.:\/-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QLOO_KEY = /^[\w.-]{8,200}$/;
const fail = (status, message) => Object.assign(new Error(message), { status });

const QLOO_HOST = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";

const CHILD_ENV = ["PATH", "HOME", "USER", "TMPDIR", "XDG_CONFIG_HOME", "APPDATA", "LOCALAPPDATA", "SystemRoot"];
const MAX_QLOO_PROCESSES = 4;
const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map();
let running = 0;
const waiting = [];

async function withSlot(fn) {
  if (running >= MAX_QLOO_PROCESSES) await new Promise((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function qloo(tool, args, apiKey) {
  const cacheKey = JSON.stringify([tool, args, apiKey ? crypto.createHash("sha256").update(apiKey).digest("hex") : "server"]);
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => CHILD_ENV.includes(k) || k.startsWith("QLOO_"))),
    QLOO_BASE_URL: QLOO_HOST,
    QLOO_TRUSTED_BASE_URL: process.env.QLOO_TRUSTED_BASE_URL || QLOO_HOST,
    ...(apiKey ? { QLOO_API_KEY: apiKey } : {}),
  };
  const value = await withSlot(async () => {
    const client = new Client({ name: "pcp", version: "0.1.0" });
    await client.connect(new StdioClientTransport({ command: process.env.QLOO_BIN || "qloo", args: ["mcp"], env }));
    try {
      const result = await client.callTool({ name: tool, arguments: args });
      return result.structuredContent ?? { status: "error", summary: "Qloo returned no structured result.", results: [] };
    } finally {
      await client.close();
    }
  });
  if (value.status === "ok" && tool !== "qloo_capabilities") {
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS });
  }
  return value;
}

let readiness = { value: false, expires: 0 };

async function qlooReady() {
  if (readiness.expires > Date.now()) return readiness.value;
  let value = false;
  try {
    const cap = await qloo("qloo_capabilities", {});
    value = Boolean(cap?.adapter?.ready);
  } catch {

  }
  readiness = { value, expires: Date.now() + 60_000 };
  return value;
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const unresolvedOf = (env) =>
  (env.resolution?.issues ?? []).map(({ input, field, kind, candidates }) => ({
    input,
    field,
    kind,
    candidates: candidates?.slice(0, 3).map((c) => c?.name ?? String(c)),
  }));

const qlooMeta = (env, unresolved) => ({
  status: env.status,
  summary: env.summary,
  error: env.error,
  warnings: env.warnings,
  unresolved,
  correlation_id: env.execution?.correlation_id,
  requests: env.provenance?.requests,
});

async function recommendWithQloo(type, signals, apiKey) {
  if (!signals.length) {
    return { candidates: [], meta: { status: "empty", summary: "Your PC has no favorites yet. Add a few to get recommendations." } };
  }
  let taste = signals.slice(0, 10);
  let env = await qloo("qloo_recommend", { target_type: type, signals: taste, limit: 10 }, apiKey);
  let unresolved = [];
  if (env.status === "needs_input") {
    unresolved = unresolvedOf(env);
    const bad = new Set(unresolved.map((u) => norm(u.input)));
    taste = taste.filter((n) => !bad.has(norm(n)));
    if (taste.length) env = await qloo("qloo_recommend", { target_type: type, signals: taste, limit: 10 }, apiKey);
  }
  const results = (Array.isArray(env.results) ? env.results : []).filter((r) => r?.name && (!r.type || r.type === `urn:entity:${type}`));
  const candidates = results.map((r, i) => {
    const affinity = typeof r.affinity === "number";
    return {
      name: r.name,
      prior: 1,
      qloo: affinity ? r.affinity : (results.length - i) / results.length,
      qloo_kind: affinity ? "affinity" : "rank",
      qloo_match: r.name,
      qloo_entity_id: r.entity_id ?? null,
    };
  });
  return { candidates, meta: qlooMeta(env, unresolved) };
}

async function rankWithQloo(type, names, signals, apiKey) {
  if (!signals.length) {
    return { scores: new Map(), meta: { status: "empty", summary: "Passport has no taste signals yet. Add a few favorites." } };
  }
  let options = names.slice(0, 10);
  let taste = signals.slice(0, 10);
  let env = await qloo("qloo_rank", { options, option_type: type, signals: taste }, apiKey);

  let unresolved = [];
  if (env.status === "needs_input" && env.resolution?.issues?.length) {
    unresolved = unresolvedOf(env);
    const bad = new Set(unresolved.map((u) => norm(u.input)));
    options = options.filter((n) => !bad.has(norm(n)));
    taste = taste.filter((n) => !bad.has(norm(n)));
    if (options.length && taste.length) env = await qloo("qloo_rank", { options, option_type: type, signals: taste }, apiKey);
  }

  const results = Array.isArray(env.results) ? env.results : [];
  const byId = new Map(results.filter((r) => r?.entity_id).map((r, i) => [r.entity_id, { ...r, position: i }]));
  const scores = new Map();
  for (const option of env.interpretation?.options ?? []) {
    const hit = byId.get(option.entityId);
    if (!hit || (hit.type && hit.type !== `urn:entity:${type}`)) continue;
    const affinity = typeof hit.affinity === "number";
    scores.set(norm(option.input), {
      value: affinity ? hit.affinity : (results.length - hit.position) / results.length,
      kind: affinity ? "affinity" : "rank",
      matched: option.name,
      match: option.match,
      entity_id: option.entityId,
    });
  }
  return {
    scores,
    meta: {
      status: env.status,
      summary: env.summary,
      error: env.error,
      warnings: env.warnings,
      unresolved,
      resolution: env.status === "needs_input" ? env.resolution : undefined,
      correlation_id: env.execution?.correlation_id,
      requests: env.provenance?.requests,
    },
  };
}

const llmReady = () => Boolean(LLM_BASE_URL || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

const providerStatus = () => ({
  anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
  openai: Boolean(process.env.OPENAI_API_KEY),
  ollama: true,
});

function customBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const loopback = LOOPBACK.includes(url.hostname);
  if (!loopback && process.env.PCP_ALLOW_CUSTOM_BASE_URL !== "1") return null;
  return { href: url.origin + url.pathname.replace(/\/$/, ""), loopback };
}

function resolveAgent(agent) {
  const env = process.env;
  if (!agent) {
    if (LLM_BASE_URL) return { provider: "openai-compatible", baseUrl: LLM_BASE_URL, key: env.LLM_API_KEY, model: MODEL };
    if (env.OPENAI_API_KEY) return resolveAgent({ provider: "openai" });
    if (!env.ANTHROPIC_API_KEY) throw fail(503, "Set OPENAI_API_KEY (or ANTHROPIC_API_KEY / LLM_BASE_URL) in .env");
    return { provider: "anthropic", key: env.ANTHROPIC_API_KEY, model: MODEL };
  }
  const { provider } = agent;
  if (!PROVIDERS.includes(provider)) throw fail(400, `agent.provider must be one of ${PROVIDERS.join(", ")}`);
  if (agent.model && !MODEL_NAME.test(String(agent.model))) throw fail(400, "agent.model is not a valid model name");
  const defaults = {
    anthropic: { keyName: "ANTHROPIC_API_KEY", model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5" },
    openai: {
      keyName: "OPENAI_API_KEY",
      model: env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL,
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
    ollama: { model: env.OLLAMA_MODEL || "llama3.2", baseUrl: env.OLLAMA_BASE_URL || "http://localhost:11434/v1" },
  }[provider];
  const key = defaults.keyName && env[defaults.keyName];
  if (defaults.keyName && !key) throw fail(503, `Set ${defaults.keyName} in .env to use the ${provider} provider`);
  const custom = provider !== "anthropic" && agent.baseUrl ? customBaseUrl(agent.baseUrl) : null;
  return {
    provider,
    model: agent.model ? String(agent.model) : defaults.model,
    baseUrl: (custom?.href ?? defaults.baseUrl)?.replace(/\/$/, ""),
    key: custom && !custom.loopback ? undefined : key,
  };
}

async function complete(prompt, { provider, baseUrl, key, model } = resolveAgent()) {
  const anthropic = provider === "anthropic";
  const url = anthropic ? "https://api.anthropic.com/v1/messages" : `${baseUrl}/chat/completions`;
  const auth = anthropic ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : key ? { authorization: `Bearer ${key}` } : {};

  const limit = provider === "openai" ? { max_completion_tokens: 4000 } : { max_tokens: 800 };
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ model, ...limit, messages: [{ role: "user", content: prompt }] }),
    });
  } catch {
    throw fail(502, `Could not reach ${provider} at ${new URL(url).origin}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(502, body?.error?.message || `LLM error ${res.status}`);
  return anthropic ? (body.content?.map((c) => c.text ?? "").join("") ?? "") : (body.choices?.[0]?.message?.content ?? "");
}

async function chatCompletion(target, system, messages, tools) {
  const anthropic = target.provider === "anthropic";
  const url = anthropic ? "https://api.anthropic.com/v1/messages" : `${target.baseUrl}/chat/completions`;
  const auth = anthropic
    ? { "x-api-key": target.key, "anthropic-version": "2023-06-01" }
    : target.key
      ? { authorization: `Bearer ${target.key}` }
      : {};
  const limit = target.provider === "openai" ? { max_completion_tokens: 6000 } : { max_tokens: 2500 };
  const payload = anthropic
    ? { model: target.model, ...limit, system, messages: messages.filter((m) => m.role === "user" || m.role === "assistant") }
    : {
        model: target.model,
        ...limit,
        messages: [{ role: "system", content: system }, ...messages],
        ...(tools ? { tools, ...(target.provider === "openai" ? { reasoning_effort: "none" } : {}) } : {}),
      };
  let res;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(payload) });
  } catch {
    throw fail(502, `Could not reach ${target.provider} at ${new URL(url).origin}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(502, body?.error?.message || `LLM error ${res.status}`);
  if (anthropic) {
    return {
      message: { role: "assistant", content: body.content?.map((c) => c.text ?? "").join("") ?? "" },
      usage: { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 },
    };
  }
  return {
    message: body.choices?.[0]?.message ?? { role: "assistant", content: "" },
    usage: { input: body.usage?.prompt_tokens ?? 0, output: body.usage?.completion_tokens ?? 0 },
  };
}

const RECOMMEND_TOOL = {
  type: "function",
  function: {
    name: "pcp_recommend",
    description:
      "Get options ranked for this user by Qloo's taste graph and their Personal Context graph (no LLM involved). Use it whenever the user wants artists, music, movies, TV shows, books, podcasts, places (restaurants, cafes, bars, venues) or brands. Never invent recommendations or scores when this tool can answer.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: TYPES },
        count: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
};

async function recommendTool(args, passport, pc, ctx) {
  const type = TYPES.includes(args?.type) ? args.type : "artist";
  const count = Math.min(10, Math.max(1, Number(args?.count) || 5));
  const signals = listOf(passport.signals).filter((s) => s?.name);
  const { candidates, meta } = await recommendWithQloo(type, activeSignals(passport), ctx.qlooKey);
  const fromGraph = pc
    ? graph.suggest(pc, type, 5)
        .filter((g) => !candidates.some((c) => norm(c.name) === norm(g.name)))
        .map((g) => ({ name: g.name, prior: 1, qloo: null, qloo_kind: null, qloo_match: null, qloo_entity_id: null }))
    : [];
  const ranked = distribution(passport, enrich(pc, type, [...candidates, ...fromGraph], signals)).slice(0, count);
  return {
    type,
    qloo_status: meta.status,
    qloo_summary: meta.status === "ok" ? undefined : meta.summary,
    results: ranked.map((r) => ({
      name: r.name,
      qloo_affinity: typeof r.qloo === "number" ? Number(r.qloo.toFixed(3)) : null,
      because_you_love: r.because ?? null,
      pc_score: Number(r.p.toFixed(3)),
    })),
  };
}

function personaPrompt(passport, uiPrompt) {
  const loves = listOf(passport.signals).filter((s) => s?.name).map((s) => `${s.name} (${String(s.type || "").replace("_", " ")})`);
  const vetoes = listOf(passport.vetoes).filter((v) => v?.name).map((v) => v.name);
  return [
    "You are the user's personal agent, powered by PCP (Personal Context Protocol). Help with anything: everyday questions, planning, how-to projects, cooking, work.",
    `The user's Personal Context (public favorites they chose): ${loves.length ? loves.join(", ") : "none yet"}.`,
    vetoes.length ? `They do not want: ${vetoes.join(", ")}.` : "",
    "Use their taste naturally where it helps, and say so briefly (for example, \"since you love Radiohead\"). Don't force it into unrelated answers.",
    "When they want artists, music, movies, TV shows, books, podcasts, places or brands, call pcp_recommend and build your answer from its results. Never invent Qloo scores. If the tool reports Qloo is unavailable, say so plainly.",
    "Be concise and practical.",
    uiPrompt ? `Respond using OpenUI Lang, following this component specification exactly:\n\n${uiPrompt}` : "Respond in concise Markdown.",
  ]
    .filter(Boolean)
    .join("\n");
}

const typeFromUrn = (urn) => {
  const type = String(urn || "").replace(/^urn:entity:/, "");
  return TYPES.includes(type) ? type : null;
};

async function remember(pc, text, recentItems, ctx) {
  const memory = [];
  for (const pref of extractPreferences(text).slice(0, 5)) {
    const described = await qloo("qloo_describe", { entity: pref.name }, ctx.qlooKey).catch(() => null);
    const hit = described?.status === "ok" ? described.results?.[0] : null;
    const verifiedType = typeFromUrn(hit?.type);
    const type = verifiedType ?? graph.inferType(pc, text).type;
    memory.push({ name: verifiedType ? hit.name : pref.name, type, liked: pref.liked, source: "chat", evidence: pref.evidence, verified: Boolean(verifiedType) });
  }
  const recent = listOf(recentItems).filter((r) => r?.name && TYPES.includes(r.type));
  for (const name of mentionsOf(text, recent.map((r) => r.name))) {
    if (memory.some((m) => norm(m.name) === norm(name))) continue;
    const item = recent.find((r) => norm(r.name) === norm(name));
    memory.push({ name: item.name, type: item.type, liked: true, source: "follow-up", evidence: "asked about it after it was suggested", verified: true });
  }
  if (pc) for (const m of memory) graph.feedback(pc, { task: text, type: m.type, name: m.name, liked: m.liked, shown: [] });
  return memory;
}

async function chat(body, ctx) {
  if (body.passport?.protocol !== PROTOCOL) throw fail(400, `passport must be a ${PROTOCOL} document`);
  if (!ctx.qlooKey && !(await qlooReady()))
    throw fail(412, "Connect Qloo first: add QLOO_API_KEY to the server's .env, or paste a Qloo key in the sidebar.");
  if (!llmReady()) throw fail(503, "Set OPENAI_API_KEY (or ANTHROPIC_API_KEY / LLM_BASE_URL) in .env");
  const pc = pcIdOf(body.pc_id);
  if (pc) graph.syncSignals(pc, listOf(body.passport.signals).filter((s) => s?.name), listOf(body.passport.vetoes));
  const messages = listOf(body.messages)
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!messages.length || messages.at(-1).role !== "user") throw fail(400, "messages must end with a user message");
  const uiPrompt = typeof body.ui_prompt === "string" ? body.ui_prompt.slice(0, 60_000) : "";
  const target = resolveAgent(DEMO_PAGE_ONLY ? undefined : body.agent);
  const tools = target.provider === "anthropic" ? undefined : [RECOMMEND_TOOL];
  const memory = body.memory === false ? [] : await remember(pc, messages.at(-1).content, body.recent_items, ctx);
  const learnedLoves = memory.filter((m) => m.liked).map(({ name, type }) => ({ name, type }));
  const learnedVetoes = memory.filter((m) => !m.liked).map(({ name, type }) => ({ name, type }));
  const passport = {
    ...body.passport,
    signals: [...listOf(body.passport.signals).filter((s) => !learnedVetoes.some((v) => norm(v.name) === norm(s?.name))), ...learnedLoves],
    vetoes: [...listOf(body.passport.vetoes), ...learnedVetoes],
  };
  const system = personaPrompt(passport, uiPrompt);
  const thread = [...messages];
  const calls = [];
  const usage = { input: 0, output: 0 };
  for (let round = 0; round < 3; round++) {
    const { message, usage: u } = await chatCompletion(target, system, thread, tools);
    usage.input += u.input;
    usage.output += u.output;
    if (!message.tool_calls?.length) {
      return { protocol: PROTOCOL, model: target.model, provider: target.provider, format: uiPrompt ? "openui-lang" : "markdown", reply: message.content ?? "", tools: calls, memory, usage };
    }
    thread.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
    for (const call of message.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const result = call.function?.name === "pcp_recommend" ? await recommendTool(args, passport, pc, ctx) : { error: "Unknown tool" };
      calls.push({ name: call.function?.name, args, result });
      thread.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw fail(502, "The agent did not finish after 3 tool rounds");
}

async function proposeWithLLM(task, type, target) {
  const text = await complete(
    `You are a general-purpose recommendation agent with no knowledge of the user. Task: "${task}". ` +
      `Propose 8 distinct real ${type.replace("_", " ")} options. Give each your own probability that it is the best pick (sum to 1) ` +
      `and a reason of at most 12 words. Reply with JSON only: {"candidates":[{"name":"...","p":0.2,"why":"..."}]}`,
    target,
  );
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return json.candidates
    .filter((c) => c?.name)
    .slice(0, 10)
    .map((c) => ({ name: String(c.name), prior: Number(c.p) || 0.01, why: c.why ? String(c.why).slice(0, 140) : null }));
}

async function rerank({ type, candidates, passport }, { qlooKey } = {}) {
  if (!TYPES.includes(type)) throw Object.assign(new Error(`type must be one of ${TYPES.join(", ")}`), { status: 400 });
  if (passport?.protocol !== PROTOCOL) throw Object.assign(new Error(`passport must be a ${PROTOCOL} document`), { status: 400 });
  const { scores, meta } = await rankWithQloo(type, candidates.map((c) => c.name), activeSignals(passport), qlooKey);
  const scored = candidates.map((c) => {
    const hit = scores.get(norm(c.name));
    return {
      name: c.name,
      prior: c.prior,
      why: c.why ?? null,
      qloo: hit?.value ?? null,
      qloo_kind: hit?.kind ?? null,
      qloo_match: hit?.matched ?? null,
      qloo_entity_id: hit?.entity_id ?? null,
    };
  });
  return { protocol: PROTOCOL, type, candidates: scored, distribution: distribution(passport, scored), qloo: meta };
}

function vaultFile(id) {
  if (!UUID.test(id)) throw fail(400, "Vault id must be a UUID");
  return path.join(VAULT, `${id.toLowerCase()}.json`);
}

async function storeVault(id, body) {
  const file = vaultFile(id);
  if (body?.protocol !== PROTOCOL || typeof body.encrypted?.data !== "string")
    throw fail(400, "Only encrypted passports can be stored");
  const { alg, kdf, iterations, salt, iv, data } = body.encrypted;
  const json = JSON.stringify({ protocol: PROTOCOL, encrypted: { alg, kdf, iterations, salt, iv, data } });
  await fs.mkdir(VAULT, { recursive: true });
  await fs.writeFile(file, json);
  return { stored: true, id, bytes: Buffer.byteLength(json) };
}

async function loadVault(id) {
  const file = vaultFile(id);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw fail(404, "Nothing stored under this id");
  }
}

async function deleteVault(id) {
  await fs.rm(vaultFile(id), { force: true });
  return { deleted: true };
}

await fs.mkdir(path.dirname(DEMO_DB), { recursive: true });
const db = new DatabaseSync(DEMO_DB);
const graph = createGraph(db);
db.exec(`CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]',
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);

db.prepare("DELETE FROM conversations WHERE demo = 1").run();

const now = () => new Date().toISOString();
const cleanTitle = (title) => String(title || "").replace(/\s+/g, " ").trim().slice(0, 80) || "New chat";

if (!db.prepare("PRAGMA table_info(conversations)").all().some((c) => c.name === "pc")) db.exec("ALTER TABLE conversations ADD COLUMN pc TEXT");

function getConversation(id, pc) {
  if (!UUID.test(id)) throw fail(400, "Conversation id must be a UUID");
  const row = db.prepare("SELECT * FROM conversations WHERE id = ? AND (demo = 1 OR pc = ?)").get(id, pc ?? "");
  if (!row) throw fail(404, "Conversation not found");
  const { pc: _owner, ...rest } = row;
  return { ...rest, demo: Boolean(row.demo), messages: JSON.parse(row.messages) };
}

function ownConversation(id, pc) {
  const conversation = getConversation(id, requirePc(pc));
  if (conversation.demo) throw fail(403, "Demo conversations are read-only");
  return conversation;
}

const listConversations = (pc) =>
  db
    .prepare("SELECT id, title, demo, created_at, updated_at FROM conversations WHERE demo = 1 OR pc = ? ORDER BY demo ASC, updated_at DESC LIMIT 100")
    .all(pc ?? "")
    .map((row) => ({ ...row, demo: Boolean(row.demo) }));

function createConversation(body, pcHeader) {
  const pc = requirePc(pcHeader);
  const id = crypto.randomUUID();
  const at = now();
  db.prepare("INSERT INTO conversations (id, title, messages, demo, created_at, updated_at, pc) VALUES (?, ?, '[]', 0, ?, ?, ?)").run(id, cleanTitle(body.title), at, at, pc);
  db.prepare("DELETE FROM conversations WHERE demo = 0 AND pc = ? AND id NOT IN (SELECT id FROM conversations WHERE pc = ? ORDER BY updated_at DESC LIMIT 100)").run(pc, pc);
  return getConversation(id, pc);
}

function updateConversation(id, body, pc) {
  const current = ownConversation(id, pc);
  const messages = body.messages ?? current.messages;
  if (!Array.isArray(messages)) throw fail(400, "messages must be an array");
  db.prepare("UPDATE conversations SET title = ?, messages = ?, updated_at = ? WHERE id = ?").run(
    body.title ? cleanTitle(body.title) : current.title,
    JSON.stringify(messages),
    now(),
    id,
  );
  return getConversation(id, pc);
}

function deleteConversation(id, pc) {
  ownConversation(id, pc);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return { deleted: true };
}

const pcIdOf = (value) => (UUID.test(String(value ?? "")) ? String(value).toLowerCase() : null);
const listOf = (value) => (Array.isArray(value) ? value.slice(0, 50) : []);

function requirePc(value) {
  const pc = pcIdOf(value);
  if (!pc) throw fail(400, "pc_id must be a UUID");
  return pc;
}

async function propose(body, ctx) {
  const task = String(body.task || "").slice(0, 200);
  if (!task.trim()) throw fail(400, "Ask for something first");
  if (body.passport?.protocol !== PROTOCOL) throw fail(400, `passport must be a ${PROTOCOL} document`);
  if (!ctx.qlooKey && !(await qlooReady()))
    throw fail(412, "Connect Qloo first: add QLOO_API_KEY to the server's .env, or paste a Qloo key in the sidebar.");
  const pc = pcIdOf(body.pc_id);
  const signals = listOf(body.passport.signals).filter((s) => s?.name);
  if (pc) graph.syncSignals(pc, signals, listOf(body.passport.vetoes));
  const inferred = TYPES.includes(body.type) ? null : graph.inferType(pc, task);
  const type = inferred?.type ?? body.type;

  let result;
  if (body.engine !== "graph" && llmReady()) {
    const target = resolveAgent(DEMO_PAGE_ONLY ? undefined : body.agent);
    const candidates = await proposeWithLLM(task, type, target);
    result = { engine: "agent", model: target.model, provider: target.provider, ...(await rerank({ type, candidates, passport: body.passport }, ctx)) };
  } else {
    const { candidates, meta } = await recommendWithQloo(type, activeSignals(body.passport), ctx.qlooKey);
    const known = new Set(candidates.map((c) => norm(c.name)));
    const fromGraph = pc
      ? graph.suggest(pc, type, 10)
          .filter((s) => !known.has(norm(s.name)))
          .map((s) => ({ name: s.name, prior: 1, qloo: null, qloo_kind: null, qloo_match: null, qloo_entity_id: null }))
      : [];
    result = { engine: "graph", protocol: PROTOCOL, type, candidates: [...candidates, ...fromGraph].slice(0, 10), qloo: meta };
  }

  result.candidates = enrich(pc, type, result.candidates, signals);
  if (pc) result.graph = graph.stats(pc);
  result.distribution = distribution(body.passport, result.candidates);
  return { task, type, inferred, reply: replyFor(task, type, result.distribution), ...result };
}

function enrich(pc, type, candidates, signals) {
  if (!pc) return candidates;
  graph.linkQloo(pc, type, candidates, signals);
  const names = candidates.map((c) => c.name);
  const graphScores = graph.scores(pc, type, names);
  const reasons = graph.because(pc, type, names);
  return candidates.map((c, i) => ({ ...c, graph: graphScores[i], because: reasons[i] }));
}

const TYPE_WORDS = { artist: "artists", book: "books", brand: "brands", movie: "movies", person: "people", place: "places", podcast: "podcasts", tv_show: "shows" };

function replyFor(task, type, ranked) {
  const top = ranked.filter((r) => r.graph !== -1).slice(0, 3);
  if (!top.length) return `I couldn't find ${TYPE_WORDS[type] ?? "picks"} for that yet. Add a few favorites to your PC and try again.`;
  const scored = top.some((r) => typeof r.qloo === "number");
  const lead = scored ? `Here are the ${TYPE_WORDS[type] ?? "picks"} I'd start with, tuned to your PC` : `Here are my ${TYPE_WORDS[type] ?? "picks"}; Qloo couldn't score them, so this is my own order`;
  return `${lead}:`;
}

async function discover(body, ctx) {
  if (body.passport?.protocol !== PROTOCOL) throw fail(400, `passport must be a ${PROTOCOL} document`);
  if (!ctx.qlooKey && !(await qlooReady()))
    throw fail(412, "Connect Qloo first: add QLOO_API_KEY to the server's .env, or paste a Qloo key in the sidebar.");
  const pc = requirePc(body.pc_id);
  const signals = listOf(body.passport.signals).filter((s) => s?.name);
  graph.syncSignals(pc, signals, listOf(body.passport.vetoes));
  const loved = new Set(signals.map((s) => norm(s.name)));
  const vetoed = new Set(listOf(body.passport.vetoes).map((v) => norm(v?.name)));
  const types = TYPES.includes(body.type) ? [body.type] : (graph.lovedTypes(pc).length ? graph.lovedTypes(pc) : ["movie", "artist"]).slice(0, 2);
  const deck = [];
  const meta = [];
  for (const type of types) {
    const { candidates, meta: m } = await recommendWithQloo(type, activeSignals(body.passport), ctx.qlooKey);
    meta.push({ type, ...m });
    const fresh = candidates.filter((c) => !loved.has(norm(c.name)) && !vetoed.has(norm(c.name)));
    const fromGraph = graph.suggest(pc, type, 5)
      .filter((g) => !fresh.some((c) => norm(c.name) === norm(g.name)) && !vetoed.has(norm(g.name)))
      .map((g) => ({ name: g.name, prior: 1, qloo: null, qloo_kind: null, qloo_match: null, qloo_entity_id: null }));
    for (const c of enrich(pc, type, [...fresh, ...fromGraph], signals)) deck.push({ ...c, type });
  }
  deck.sort((a, b) => (b.graph ?? 0) + (b.qloo ?? 0) - ((a.graph ?? 0) + (a.qloo ?? 0)));
  return { protocol: PROTOCOL, engine: "graph", llm_tokens: 0, types, cards: deck.slice(0, 20), qloo: meta, graph: graph.stats(pc) };
}

const routes = {
  "GET /api/status": async () => ({
    protocol: PROTOCOL,
    qloo_ready: await qlooReady(),
    qloo_byok: true,
    llm_ready: llmReady(),
    default_provider: LLM_BASE_URL ? "openai-compatible" : process.env.OPENAI_API_KEY ? "openai" : "anthropic",
    model: !LLM_BASE_URL && process.env.OPENAI_API_KEY ? process.env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL : MODEL,
    demo_page_only: DEMO_PAGE_ONLY,
    providers: providerStatus(),
    google_client_id: process.env.GOOGLE_CLIENT_ID || null,
  }),

  "POST /v1/rerank": (body, _, ctx) => rerank(body, ctx),

  "POST /v1/propose": (body, _, ctx) => propose(body, ctx),
  "POST /v1/discover": (body, _, ctx) => discover(body, ctx),
  "POST /v1/chat": (body, _, ctx) => chat(body, ctx),
  "POST /v1/graph/signals": (body) => graph.syncSignals(requirePc(body.pc_id), listOf(body.signals), listOf(body.vetoes)),
  "POST /v1/graph/feedback": (body) =>
    graph.feedback(requirePc(body.pc_id), {
      task: String(body.task || "").slice(0, 200),
      type: TYPES.includes(body.type) ? body.type : null,
      name: String(body.name || "").slice(0, 200),
      liked: Boolean(body.liked),
      shown: listOf(body.shown).map(String),
    }),
  "GET /v1/graph/:id": (_, { id }) => graph.snapshot(requirePc(id)),
  "DELETE /v1/graph/:id": (_, { id }) => graph.reset(requirePc(id)),
  "GET /v1/conversations": (_, __, ctx) => listConversations(pcIdOf(ctx.pcId)),
  "POST /v1/conversations": (body, _, ctx) => createConversation(body, pcIdOf(ctx.pcId)),
  "GET /v1/conversations/:id": (_, { id }, ctx) => getConversation(id, pcIdOf(ctx.pcId)),
  "PUT /v1/conversations/:id": (body, { id }, ctx) => updateConversation(id, body, pcIdOf(ctx.pcId)),
  "DELETE /v1/conversations/:id": (_, { id }, ctx) => deleteConversation(id, pcIdOf(ctx.pcId)),
  "PUT /v1/vault/:id": (body, { id }) => storeVault(id, body),
  "GET /v1/vault/:id": (_, { id }) => loadVault(id),
  "DELETE /v1/vault/:id": (_, { id }) => deleteVault(id),
};

function findRoute(method, pathname) {
  const exact = routes[`${method} ${pathname}`];
  if (exact) return { handler: exact, params: {} };
  const [, base, id] = pathname.match(/^(.*)\/([^/]+)$/) ?? [];
  const handler = base !== undefined && routes[`${method} ${base}/:id`];
  return handler ? { handler, params: { id } } : null;
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 200_000) throw fail(413, "Request too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw fail(400, "Body must be JSON");
  }
}

const exists = (file) => fs.access(file).then(() => true, () => false);

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, "http://local");
  const roots = (await exists(path.join(WEB_OUT, "index.html"))) ? [WEB_OUT, PUBLIC] : [PUBLIC];
  for (const root of roots) {
    const base = path.normalize(path.join(root, pathname));
    if (base !== root && !base.startsWith(root + path.sep)) return send(res, 403, { error: "Forbidden" });
    const files = pathname.endsWith("/") ? [path.join(base, "index.html")] : [base, `${base}.html`, path.join(base, "index.html")];
    for (const file of files) {
      const data = await fs.readFile(file).catch(() => null);
      if (!data) continue;
      const headers = { "content-type": MIME[path.extname(file)] || "application/octet-stream" };
      if (DEMO_PAGE_ONLY && file.endsWith(".html")) headers["set-cookie"] = sessionCookie(req);
      res.writeHead(200, headers);
      return res.end(data);
    }
  }
  send(res, 404, { error: "Not found" });
}

const SESSION_SECRET = crypto.randomBytes(32);
const SESSION_TTL_MS = 12 * 3_600_000;
const sign = (value) => crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");

function sessionCookie(req) {
  const expires = String(Date.now() + SESSION_TTL_MS);
  const https = req.headers["x-forwarded-proto"] === "https" || String(req.headers["cf-visitor"] || "").includes("https");
  return `pcp_session=${expires}.${sign(expires)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}${https ? "; Secure" : ""}`;
}

function requirePageSession(req) {
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("pcp_session="));
  const [expires = "", signature = ""] = (cookie?.slice("pcp_session=".length) ?? "").split(".");
  const expected = expires ? sign(expires) : "";
  const valid =
    Number(expires) > Date.now() &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid || req.headers["sec-fetch-site"] !== "same-origin")
    throw fail(403, "This hosted demo only serves its own web page. To use PCP from the CLI, Claude Code or your own agents, run your own server with `pcp serve` (see the README).");
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const CORS_ORIGINS = (process.env.PCP_CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);

function corsHeaders(req) {
  const { origin } = req.headers;
  if (!origin || !CORS_ORIGINS.length) return {};
  if (CORS_ORIGINS.includes("*")) return { "access-control-allow-origin": "*" };
  return CORS_ORIGINS.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
}

const RATE_LIMIT = Number(process.env.PCP_RATE_LIMIT || 20);
const METERED = new Set(["POST /v1/propose", "POST /v1/rerank", "POST /v1/discover", "POST /v1/chat"]);
const recentCalls = new Map();

function clientId(req) {

  if (process.env.PCP_TRUST_PROXY === "1") {
    const forwarded = req.headers["cf-connecting-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || "unknown";
}

function rateLimit(req) {
  const now = Date.now();
  const id = clientId(req);
  const recent = (recentCalls.get(id) || []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT) throw fail(429, "Too many requests. Try again in a minute.");
  recent.push(now);
  recentCalls.delete(id);
  recentCalls.set(id, recent);
  if (recentCalls.size > 5000) recentCalls.delete(recentCalls.keys().next().value);
}

http
  .createServer(async (req, res) => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...cors,
        ...(cors["access-control-allow-origin"] && {
          "access-control-allow-headers": "content-type, x-qloo-api-key, x-pc-id",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        }),
      });
      return res.end();
    }
    const { pathname } = new URL(req.url, "http://local");
    const route = findRoute(req.method, pathname);
    if (!route) return serveStatic(req, res);
    try {
      if (DEMO_PAGE_ONLY && pathname.startsWith("/v1/")) requirePageSession(req);
      if (METERED.has(`${req.method} ${pathname}`)) rateLimit(req);
      const body = ["POST", "PUT"].includes(req.method) ? await readJson(req) : {};

      const supplied = req.headers["x-qloo-api-key"];
      if (supplied && !QLOO_KEY.test(supplied)) throw fail(400, "That does not look like a Qloo API key");
      const qlooKey = supplied && !(await qlooReady()) ? supplied : undefined;
      send(res, 200, await route.handler(body, route.params, { qlooKey, pcId: req.headers["x-pc-id"] }), cors);
    } catch (error) {
      send(res, error.status || 500, { error: error.message }, cors);
    }
  })
  .listen(PORT, HOST, () => console.log(`Personal Context server on http://${HOST}:${PORT}`));
