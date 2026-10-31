export const PROTOCOL = "pcp/0.1";
export const FEATURES = ["llm_logprior", "qloo_affinity", "pc_graph"];
const STORE_KEY = "pcp-passport";
const MAX_SIGNALS = 10;
const KDF_ITERATIONS = 310_000;

const now = () => new Date().toISOString();
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createPassport() {
  return {
    protocol: PROTOCOL,
    id: crypto.randomUUID(),
    created: now(),
    updated: now(),
    consent: { pii: false, share_signals_with: ["qloo"] },
    signals: [],
    vetoes: [],
    policy: {
      model: "conditional-logit/v1",
      features: FEATURES,
      weights: [1, 1, 1],
      lr: 0.5,
      updates: 0,
    },
    history: [],
  };
}

export function addSignal(passport, name, type, source = "seed") {
  const clean = String(name ?? "").trim();
  if (!clean) return passport;
  passport.signals = passport.signals.filter((s) => norm(s.name) !== norm(clean));
  passport.signals.push({ name: clean, type, source, at: now() });
  passport.vetoes = passport.vetoes.filter((v) => norm(v.name) !== norm(clean));
  passport.updated = now();
  return passport;
}

export function removeSignal(passport, name) {
  passport.signals = passport.signals.filter((s) => norm(s.name) !== norm(name));
  passport.updated = now();
  return passport;
}

export const activeSignals = (passport) => passport.signals.slice(-MAX_SIGNALS).map((s) => s.name);

const weightsOf = (passport) => FEATURES.map((_, k) => passport.policy?.weights?.[k] ?? 1);

function zscore(values) {
  const nums = values.filter((v) => typeof v === "number");
  const mean = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
  const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length || 1)) || 1;
  return (v) => (typeof v === "number" ? (v - mean) / sd : 0);
}

export const disclose = (passport) => ({
  protocol: passport.protocol,
  signals: passport.signals.slice(-MAX_SIGNALS).map(({ name, type }) => ({ name, type })),
  vetoes: passport.vetoes.map(({ name, type }) => ({ name, type })),
  policy: { weights: weightsOf(passport) },
});

export function distribution(passport, candidates) {
  const vetoed = new Set(passport.vetoes.map((v) => norm(v.name)));
  const live = candidates.filter((c) => !vetoed.has(norm(c.name)));
  const priorSum = live.reduce((s, c) => s + Math.max(c.prior || 0, 0), 0) || 1;
  const zQloo = zscore(live.map((c) => c.qloo));
  const zGraph = zscore(live.map((c) => c.graph));
  const w = weightsOf(passport);

  const rows = live.map((c) => {
    const p_llm = Math.max(c.prior || 0, 0) / priorSum;
    const x = [Math.log(Math.max(p_llm, 1e-4)), zQloo(c.qloo), zGraph(c.graph)];
    return { ...c, p_llm, x, logit: x.reduce((s, v, k) => s + w[k] * v, 0) };
  });
  const top = Math.max(...rows.map((r) => r.logit));
  const z = rows.reduce((s, r) => s + Math.exp(r.logit - top), 0);
  for (const r of rows) r.p = Math.exp(r.logit - top) / z;
  return rows.sort((a, b) => b.p - a.p);
}

export function feedback(passport, candidates, name, liked, type) {
  const rows = distribution(passport, candidates);
  const chosen = rows.find((r) => norm(r.name) === norm(name));
  if (!chosen) return passport;
  const mean = FEATURES.map((_, k) => rows.reduce((s, r) => s + r.p * r.x[k], 0));
  const sign = liked ? 1 : -1;
  const { lr } = passport.policy;
  passport.policy.weights = weightsOf(passport).map((w, k) =>
    clamp(w + sign * lr * (chosen.x[k] - mean[k]), -5, 5),
  );
  passport.policy.updates += 1;

  if (liked) addSignal(passport, name, type, "accepted");
  else if (!passport.vetoes.some((v) => norm(v.name) === norm(name)))
    passport.vetoes.push({ name, type, at: now() });

  passport.history.unshift({ at: now(), name, type, liked, weights: [...passport.policy.weights] });
  passport.history = passport.history.slice(0, 500);
  passport.updated = now();
  return passport;
}

export function load() {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.protocol === PROTOCOL ? parsed : null;
  } catch {
    return null;
  }
}

export function save(passport) {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(passport));
  } catch {

  }
}

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPassport(passport, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(passport)));
  return {
    protocol: PROTOCOL,
    encrypted: { alg: "AES-256-GCM", kdf: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(data) },
  };
}

export const isEncrypted = (doc) => Boolean(doc?.encrypted?.data);

export async function importPassport(text, passphrase) {
  let parsed = JSON.parse(text);
  if (isEncrypted(parsed)) {
    const e = parsed.encrypted;
    const key = await deriveKey(passphrase ?? "", fromB64(e.salt), e.iterations);
    const plain = await crypto.subtle
      .decrypt({ name: "AES-GCM", iv: fromB64(e.iv) }, key, fromB64(e.data))
      .catch(() => {
        throw new Error("Wrong passphrase or damaged passport");
      });
    parsed = JSON.parse(new TextDecoder().decode(plain));
  }
  if (parsed?.protocol !== PROTOCOL) throw new Error(`Not a ${PROTOCOL} document`);
  return parsed;
}
