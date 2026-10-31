#!/usr/bin/env node
import fs from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as PCP from "../public/sdk/pcp.js";

const TYPES = ["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show"];
const MAX_CANDIDATES = 10;
const RECENT_RERANKS = 5;
const VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const log = (message) => process.stderr.write(`[pcp mcp] ${message}\n`);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const round = (v) => (typeof v === "number" ? Number(v.toFixed(4)) : v);
const expandHome = (p) => (p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p);

function displayUrl(url) {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function config(options = {}, env = process.env) {
  const server = String(options.server || env.PCP_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
  return {
    file: path.resolve(expandHome(options.passport || env.PCP_PASSPORT || path.join(os.homedir(), ".pcp", "passport.json"))),
    server,
    shownServer: displayUrl(server),
    passphrase: env.PCP_PASSPHRASE || undefined,
    qlooKey: env.PCP_QLOO_API_KEY || undefined,
  };
}

function createStore({ file, passphrase }) {
  let chain = Promise.resolve();
  const locked = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  async function write(passport) {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const doc = passphrase ? await PCP.encryptPassport(passport, passphrase) : passport;
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 });
    await fs.rename(tmp, file);
  }

  async function load() {
    let text;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const passport = PCP.createPassport();
      await write(passport);
      log(`created a new passport at ${file}`);
      return { passport, encrypted: Boolean(passphrase) };
    }
    let doc;
    try {
      doc = JSON.parse(text);
    } catch {
      throw new Error(`${file} is not valid JSON`);
    }
    const encrypted = PCP.isEncrypted(doc);
    if (encrypted && !passphrase) throw new Error(`The passport at ${file} is encrypted. Set PCP_PASSPHRASE for this MCP server.`);
    return { passport: await PCP.importPassport(text, passphrase), encrypted };
  }

  return {
    load: () => locked(load),
    update: (fn) =>
      locked(async () => {
        const { passport } = await load();
        const result = await fn(passport);
        await write(passport);
        return result;
      }),
    idle: () => chain,
  };
}

async function api(cfg, method, route, body, timeout = 60_000) {
  const headers = { "content-type": "application/json" };
  if (cfg.qlooKey && route === "/v1/rerank") headers["x-qloo-api-key"] = cfg.qlooKey;
  let res;
  try {
    res = await fetch(`${cfg.server}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const reason = error.name === "TimeoutError" ? "timed out" : error.cause?.code || error.message;
    throw new Error(`Could not reach the PCP server at ${cfg.shownServer} (${reason}). Start it with \`pcp serve\` or set PCP_URL.`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `PCP server returned HTTP ${res.status}`);
  return data;
}

function cleanCandidates(list) {
  if (!Array.isArray(list) || !list.length) throw new Error("candidates must be a non-empty array of { name, prior? }");
  const seen = new Set();
  const items = [];
  for (const c of list) {
    const name = String((typeof c === "string" ? c : c?.name) ?? "").trim();
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    const prior = c && typeof c === "object" && c.prior !== undefined && c.prior !== null ? Number(c.prior) : NaN;
    items.push({ name, prior: Number.isFinite(prior) && prior >= 0 ? prior : null });
  }
  if (!items.length) throw new Error("candidates must include at least one name");
  if (items.length > MAX_CANDIDATES) throw new Error(`Send at most ${MAX_CANDIDATES} candidates (Qloo scores up to ${MAX_CANDIDATES} per call)`);
  const given = items.filter((c) => c.prior !== null);
  const fill = given.length ? given.reduce((s, c) => s + c.prior, 0) / given.length : 1 / items.length;
  return items.map((c) => ({ name: c.name, prior: c.prior ?? fill }));
}

const summarize = (passport, candidates) =>
  PCP.distribution(passport, candidates).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    p: round(r.p),
    p_agent: round(r.p_llm),
    qloo: round(r.qloo ?? null),
    qloo_kind: r.qloo_kind ?? null,
    qloo_match: r.qloo_match ?? null,
  }));

function createTools(cfg) {
  const store = createStore(cfg);
  const recent = [];

  async function status() {
    const server = api(cfg, "GET", "/api/status", undefined, 20_000).then(
      (s) => ({ url: cfg.shownServer, reachable: true, protocol: s.protocol, qloo_ready: s.qloo_ready, qloo_byok: s.qloo_byok, llm_ready: s.llm_ready }),
      (error) => ({ url: cfg.shownServer, reachable: false, error: error.message }),
    );
    const { passport, encrypted } = await store.load();
    return {
      passport: {
        file: cfg.file,
        encrypted_at_rest: encrypted,
        protocol: passport.protocol,
        signal_count: passport.signals.length,
        signals: passport.signals.map(({ name, type, source }) => ({ name, type, source })),
        active_signals: PCP.activeSignals(passport),
        vetoes: passport.vetoes.map((v) => v.name),
        weights: passport.policy.weights,
        features: passport.policy.features,
        updates: passport.policy.updates,
        last_feedback: passport.history[0] ?? null,
      },
      server: await server,
      qloo_key: cfg.qlooKey ? "PCP_QLOO_API_KEY is set and sent with each rerank" : "not set; the server's own Qloo credential is used",
      last_rerank: recent[0] ? { type: recent[0].type, candidates: recent[0].candidates.map((c) => c.name) } : null,
    };
  }

  async function addSignal({ name, type } = {}) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new Error("name is required");
    if (!TYPES.includes(type)) throw new Error(`type must be one of ${TYPES.join(", ")}`);
    return store.update((passport) => {
      PCP.addSignal(passport, clean, type);
      return { added: { name: clean, type }, signal_count: passport.signals.length, disclosed: PCP.disclose(passport) };
    });
  }

  async function rerank({ type, candidates } = {}) {
    if (!TYPES.includes(type)) throw new Error(`type must be one of ${TYPES.join(", ")}`);
    const list = cleanCandidates(candidates);
    const { passport } = await store.load();
    const body = await api(cfg, "POST", "/v1/rerank", { type, candidates: list, passport: PCP.disclose(passport) });
    const scored = Array.isArray(body.candidates) ? body.candidates : list.map((c) => ({ ...c, qloo: null }));
    recent.unshift({ type: body.type || type, candidates: scored });
    recent.length = Math.min(recent.length, RECENT_RERANKS);

    const ranked = summarize(passport, scored);
    const kept = new Set(ranked.map((r) => norm(r.name)));
    const vetoed = scored.filter((c) => !kept.has(norm(c.name))).map((c) => c.name);
    const meta = body.qloo ?? {};
    const unresolved = Array.isArray(meta.unresolved) ? meta.unresolved : [];
    const qloo = {
      status: meta.status ?? null,
      summary: meta.summary ?? null,
      ...(meta.error ? { error: meta.error } : {}),
      unresolved,
    };
    const scoredByQloo = ranked.some((r) => typeof r.qloo === "number");
    const notes = [];
    if (!ranked.length) notes.push("Every candidate is on the user's veto list. Propose different options.");
    else if (scoredByQloo) notes.push("Present the options in this order. When the user picks or rejects one, call pcp_feedback.");
    else
      notes.push(
        `Qloo did not score these options (status: ${qloo.status ?? "unknown"}). The order is your own distribution re-weighted by the user's local model only. Say that taste scoring was unavailable; do not invent scores.`,
      );
    if (vetoed.length) notes.push(`Removed because the user vetoed them: ${vetoed.join(", ")}.`);
    if (unresolved.length)
      notes.push(
        "Qloo could not match some inputs (see qloo.unresolved). Mention them; for an unresolved option, retry with a more exact title; for an unresolved signal, suggest the user re-add it with pcp_add_signal using one of the listed candidates.",
      );
    return { type: body.type || type, ranked, vetoed, qloo, weights: passport.policy.weights, notes };
  }

  async function feedback({ name, liked } = {}) {
    const key = norm(name);
    if (!key) throw new Error("name is required");
    if (typeof liked === "string") liked = liked.toLowerCase() === "true";
    if (typeof liked !== "boolean") throw new Error("liked must be true or false");
    const entry = recent.find((e) => e.candidates.some((c) => norm(c.name) === key));
    if (!entry) throw new Error(`"${name}" is not in a recent pcp_rerank result. Call pcp_rerank with a list that includes it first.`);
    const chosen = entry.candidates.find((c) => norm(c.name) === key).name;
    return store.update((passport) => {
      const before = { weights: [...passport.policy.weights], updates: passport.policy.updates };
      PCP.feedback(passport, entry.candidates, chosen, liked, entry.type);
      const trained = passport.policy.updates !== before.updates;
      return {
        name: chosen,
        type: entry.type,
        liked,
        trained,
        effect: !trained
          ? "No change: this option is already vetoed."
          : liked
            ? "Model updated and the option was added as a taste signal."
            : "Model updated and the option was vetoed.",
        weights_before: before.weights,
        weights: passport.policy.weights,
        updates: passport.policy.updates,
        distribution: summarize(passport, entry.candidates),
      };
    });
  }

  async function disclose() {
    const { passport } = await store.load();
    return PCP.disclose(passport);
  }

  const tools = [
    {
      name: "pcp_status",
      description:
        "Show the user's Personal Context passport (taste signals, vetoes, the 2 learned model weights and how many feedback updates trained them) and whether the PCP server and Qloo are ready. Use when the user asks about their taste profile or passport, or when another pcp tool fails.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { title: "Passport status", readOnlyHint: true, openWorldHint: true },
      handler: status,
    },
    {
      name: "pcp_add_signal",
      description:
        "Add a public entity the user loves (an artist, movie, book, place, brand, podcast, TV show or public figure) to their passport as a taste signal. Use when the user names a favorite or asks you to remember one. Public cultural entities only: never private people, contact details, health or other personal data.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, description: "Public name, e.g. \"Radiohead\" or \"Arrival\"" },
          type: { type: "string", enum: TYPES, description: "Entity type; use artist for musicians and bands" },
        },
        required: ["name", "type"],
        additionalProperties: false,
      },
      annotations: { title: "Add taste signal", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: addSignal,
    },
    {
      name: "pcp_rerank",
      description:
        "Before recommending movies, music, books, TV shows, podcasts, places, brands or public figures to this user, draft your own candidate list (with your own probability for each if you have one), call pcp_rerank, and present the reordered list. It re-weights your options with Qloo taste affinity and the user's on-device model, and drops anything the user vetoed. Only the candidate names, the type and pcp_disclose's payload leave the device. If no option has a qloo score, say taste scoring was unavailable rather than inventing one.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: TYPES, description: "Category of every candidate" },
          candidates: {
            type: "array",
            minItems: 1,
            maxItems: MAX_CANDIDATES,
            description: "Your options, best first. prior is your own probability or weight (optional; missing priors are filled evenly).",
            items: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1 },
                prior: { type: "number", minimum: 0 },
              },
              required: ["name"],
              additionalProperties: false,
            },
          },
        },
        required: ["type", "candidates"],
        additionalProperties: false,
      },
      annotations: { title: "Rerank with Personal Context", readOnlyHint: true, openWorldHint: true },
      handler: rerank,
    },
    {
      name: "pcp_feedback",
      description:
        "Train the user's on-device model on their reaction to an option from a recent pcp_rerank result. Call it when the user picks, accepts, likes or rejects one of the options you presented: liked=true adds it as a taste signal, liked=false vetoes it so future rankings drop it. Only for the user's own stated reactions, never your guesses.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, description: "The option's name as returned by pcp_rerank" },
          liked: { type: "boolean" },
        },
        required: ["name", "liked"],
        additionalProperties: false,
      },
      annotations: { title: "Train on feedback", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: feedback,
    },
    {
      name: "pcp_disclose",
      description:
        "Return exactly the part of the passport that leaves the device with each pcp_rerank call: the latest 10 signals (name, type), the vetoes (name) and the 2 model weights. No ID, history or timestamps. Use when the user asks what is shared or has a privacy question.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { title: "What leaves the device", readOnlyHint: true, openWorldHint: false },
      handler: disclose,
    },
  ];
  return { tools, store };
}

const INSTRUCTIONS =
  "Personal Context (PCP) holds this user's taste passport. Before recommending movies, music, books, TV shows, podcasts, places, brands or public figures, call pcp_rerank with your candidates and present the reordered list. Call pcp_feedback when the user accepts or rejects one of those options, and pcp_add_signal when they name a favorite.";

export async function main(options = {}) {
  const cfg = config(options);
  const { tools, store } = createTools(cfg);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const server = new Server({ name: "personal-context", version: VERSION }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = byName.get(name);
    if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    const started = Date.now();
    try {
      const result = await tool.handler(args ?? {});
      log(`${name} ok (${Date.now() - started} ms)`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      log(`${name} failed: ${error.message}`);
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
  });

  server.onerror = (error) => log(`protocol error: ${error.message}`);
  await server.connect(new StdioServerTransport());
  process.stdin.on("end", () => store.idle().finally(() => process.exit(0)));
  log(`ready: passport ${cfg.file} (${cfg.passphrase ? "encrypted at rest" : "plaintext; set PCP_PASSPHRASE to encrypt"}), server ${cfg.shownServer}`);
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const flag = (k) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  main({ passport: flag("passport"), server: flag("server") }).catch((error) => {
    log(error.message);
    process.exit(1);
  });
}
