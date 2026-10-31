#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PCP from "../public/sdk/pcp.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
if (argv[0] === "pcp") argv.shift();
const [cmd, ...args] = argv;
const opt = {};
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith("--")) continue;
  const next = args[i + 1];
  opt[args[i].slice(2)] = next === undefined || next.startsWith("--") ? true : (i++, next);
}
const file = opt.passport || process.env.PCP_PASSPORT || "passport.json";
const lastFile = `${file}.last.json`;
const server = String(opt.server || process.env.PCP_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const passphrase = process.env.PCP_PASSPHRASE;
const qlooKey = process.env.PCP_QLOO_API_KEY;
const out = (v) => console.log(JSON.stringify(v, null, 2));

async function read() {
  try {
    return await PCP.importPassport(await fs.readFile(file, "utf8"), passphrase);
  } catch (error) {
    if (error.code === "ENOENT") return PCP.createPassport();
    throw error;
  }
}

async function write(passport) {
  const doc = passphrase ? await PCP.encryptPassport(passport, passphrase) : passport;
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await fs.writeFile(file, JSON.stringify(doc, null, 2));
}

const parseCandidates = (text) => {
  const items = String(text || "").split(",").map((s) => s.trim()).filter(Boolean);
  return items.map((item) => {
    const [name, prior] = item.split("=");
    return { name: name.trim(), prior: prior ? Number(prior) : 1 / items.length };
  });
};

const summarize = (passport, candidates) =>
  PCP.distribution(passport, candidates).map(({ name, p, p_llm, qloo }) => ({
    name,
    p: Number(p.toFixed(4)),
    p_agent: Number(p_llm.toFixed(4)),
    qloo,
  }));

async function feedback(liked) {
  const passport = await read();
  const last = JSON.parse(await fs.readFile(lastFile, "utf8"));
  PCP.feedback(passport, last.candidates, opt.name, liked, last.type);
  await write(passport);
  out({ weights: passport.policy.weights, updates: passport.policy.updates, distribution: summarize(passport, last.candidates) });
}

async function loadEnvFile(envFile, env) {
  let text;
  try {
    text = await fs.readFile(envFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" && opt.env === undefined) return false;
    throw error;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
}

const commands = {
  async init() {
    await write(PCP.createPassport());
    out({ created: file, encrypted: Boolean(passphrase) });
  },
  async add() {
    const passport = await read();
    PCP.addSignal(passport, opt.name, opt.type || "artist");
    await write(passport);
    out(PCP.disclose(passport));
  },
  async rerank() {
    const passport = await read();
    const res = await fetch(`${server}/v1/rerank`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(qlooKey ? { "x-qloo-api-key": qlooKey } : {}) },
      body: JSON.stringify({ type: opt.type || "movie", candidates: parseCandidates(opt.candidates), passport: PCP.disclose(passport) }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    await fs.writeFile(lastFile, JSON.stringify({ type: body.type, candidates: body.candidates }));
    out({ qloo: { status: body.qloo.status, summary: body.qloo.summary }, distribution: summarize(passport, body.candidates) });
  },
  like: () => feedback(true),
  nope: () => feedback(false),
  async show() {
    out(await read());
  },
  async serve() {
    const { spawn } = await import("node:child_process");
    const env = { ...process.env };
    env.PCP_DATA_DIR ||= path.join(os.homedir(), ".pcp", "data");
    if (opt.port !== undefined && opt.port !== true) env.PORT = String(opt.port);
    if (opt.host !== undefined && opt.host !== true) env.HOST = String(opt.host);
    const envFile = path.resolve(typeof opt.env === "string" ? opt.env : ".env");
    if (envFile !== path.join(ROOT, ".env") && (await loadEnvFile(envFile, env))) console.error(`pcp serve: loaded ${envFile}`);
    const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(ROOT, "server.mjs")], { env, stdio: "inherit" });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    process.exitCode = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => resolve(code ?? (["SIGINT", "SIGTERM"].includes(signal) ? 0 : 1)));
    });
  },
  async mcp() {
    const { main } = await import("./pcp-mcp.mjs");
    await main({ passport: opt.passport, server: opt.server });
  },
};

const usage = `Usage: pcp <command> [--passport passport.json] [--server URL]
  init                                   create your Personal Context (PC) file
  add --name "Radiohead" --type artist   add a taste signal
  rerank --type movie --candidates "Arrival=0.3,Inception=0.5"
                                         re-weight an agent's options with Qloo + your model
  like --name "Arrival"                  train locally on the last rerank
  nope --name "Inception"                veto and train locally
  show                                   print the passport
  serve [--port 8787] [--host 127.0.0.1] [--env .env]
                                         start the PCP server (API + demo page)
  mcp                                    run the MCP server on stdio (Claude Code, any MCP client)
  help                                   show this help
Types: artist, book, brand, movie, person, place, podcast, tv_show
Env: PCP_URL (default http://127.0.0.1:8787), PCP_PASSPHRASE (encrypt at rest),
     PCP_PASSPORT (default ./passport.json; for mcp ~/.pcp/passport.json),
     PCP_QLOO_API_KEY (optional: your own Qloo key, sent with each rerank)`;

if (!cmd || ["help", "--help", "-h"].includes(cmd)) {
  console.log(usage);
} else if (!Object.hasOwn(commands, cmd)) {
  console.log(usage);
  process.exitCode = 1;
} else {
  await commands[cmd]().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
