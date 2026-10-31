import { typeMany } from "./format";
import type { HistoryEntry, Passport } from "./pcp";

export type Day = { key: string; label: string; loves: number; skips: number; swipes: number; qloo: number };
export type WeightPoint = { label: string; agent: number; qloo: number; graph: number };
export type WeekPoint = { label: string; affinity: number | null };
export type GrowthPoint = { label: string; nodes: number; edges: number };
export type MixPoint = { label: string; count: number };

export type Insights = {
  sample: boolean;
  days: Day[];
  weights: WeightPoint[];
  weeks: WeekPoint[];
  growth: GrowthPoint[];
  mix: MixPoint[];
};

export const REAL_THRESHOLD = 20;
const DAYS = 30;
const DAY_MS = 86_400_000;

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function calendar(now: number) {
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: DAYS }, (_, i) => today.getTime() - (DAYS - 1 - i) * DAY_MS);
}

function sampleInsights(seed: string, now: number): Insights {
  const rand = seeded(seed);
  const stamps = calendar(now);
  let w = [1, 1, 1];
  let nodes = 6;
  let edges = 8;
  const days: Day[] = [];
  const weights: WeightPoint[] = [];
  const growth: GrowthPoint[] = [];
  const affinities: number[][] = [];
  stamps.forEach((t, i) => {
    const weekday = new Date(t).getDay();
    const base = 2 + i * 0.18 + (weekday === 0 || weekday === 6 ? 3 : 0);
    const swipes = Math.max(0, Math.round(base + (rand() - 0.35) * 6));
    const loves = Math.round(swipes * (0.42 + rand() * 0.2));
    const skips = swipes - loves;
    const scored = Math.round(loves * (0.7 + rand() * 0.3));
    days.push({ key: dayKey(t), label: dayLabel(t), loves, skips, swipes, qloo: scored });
    w = [
      Math.max(0.2, w[0] - 0.02 * swipes * (0.4 + rand() * 0.3) * 0.25),
      Math.min(3.2, w[1] + 0.02 * swipes * (0.5 + rand() * 0.4) * 0.25),
      Math.min(3.2, w[2] + 0.02 * swipes * (0.3 + rand() * 0.5) * 0.25),
    ];
    weights.push({ label: dayLabel(t), agent: +w[0].toFixed(3), qloo: +w[1].toFixed(3), graph: +w[2].toFixed(3) });
    nodes += loves + Math.round(rand() * 2);
    edges += swipes * 2 + Math.round(rand() * 4);
    growth.push({ label: dayLabel(t), nodes, edges });
    const week = Math.floor(i / 7);
    affinities[week] = affinities[week] ?? [];
    for (let k = 0; k < loves; k++) affinities[week].push(0.55 + i * 0.006 + rand() * 0.18);
  });
  const weeks = affinities.map((list, k) => ({
    label: `Wk of ${dayLabel(stamps[Math.min(k * 7, stamps.length - 1)])}`,
    affinity: list.length ? +(list.reduce((a, b) => a + b, 0) / list.length).toFixed(3) : null,
  }));
  const mixBase: [string, number][] = [
    ["movie", 9],
    ["artist", 7],
    ["tv_show", 5],
    ["book", 4],
    ["podcast", 2],
    ["place", 2],
  ];
  const mix = mixBase.map(([t, n]) => ({ label: typeMany(t), count: n + Math.round(rand() * 4) }));
  return { sample: true, days, weights, weeks, growth, mix };
}

function realInsights(passport: Passport, now: number): Insights {
  const stamps = calendar(now);
  const history = [...passport.history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const byDay = new Map<string, HistoryEntry[]>();
  for (const h of history) {
    const k = dayKey(Date.parse(h.at));
    byDay.set(k, [...(byDay.get(k) ?? []), h]);
  }
  const before = history.filter((h) => Date.parse(h.at) < stamps[0] - DAY_MS / 2);
  let w = before.at(-1)?.weights ?? [1, 1, 1];
  let nodes = passport.signals.filter((s) => s.source !== "accepted").length + before.filter((h) => h.liked).length;
  let edges = before.length;
  const seen = new Set<string>();
  const days: Day[] = [];
  const weights: WeightPoint[] = [];
  const growth: GrowthPoint[] = [];
  const affinities: number[][] = [];
  stamps.forEach((t, i) => {
    const list = byDay.get(dayKey(t)) ?? [];
    const loves = list.filter((h) => h.liked).length;
    const qloo = list.filter((h) => h.liked && typeof h.qloo === "number").length;
    days.push({ key: dayKey(t), label: dayLabel(t), loves, skips: list.length - loves, swipes: list.length, qloo });
    const last = list.at(-1)?.weights;
    if (last) w = last;
    weights.push({ label: dayLabel(t), agent: w[0] ?? 1, qloo: w[1] ?? 1, graph: w[2] ?? 1 });
    for (const h of list) {
      if (h.liked && !seen.has(h.name)) {
        seen.add(h.name);
        nodes += 1;
      }
      edges += 1;
    }
    growth.push({ label: dayLabel(t), nodes, edges });
    const week = Math.floor(i / 7);
    affinities[week] = affinities[week] ?? [];
    for (const h of list) if (h.liked && typeof h.qloo === "number") affinities[week].push(h.qloo);
  });
  const weeks = affinities.map((list, k) => ({
    label: `Wk of ${dayLabel(stamps[Math.min(k * 7, stamps.length - 1)])}`,
    affinity: list.length ? +(list.reduce((a, b) => a + b, 0) / list.length).toFixed(3) : null,
  }));
  const counts = new Map<string, number>();
  for (const s of passport.signals) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  const mix = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => ({ label: typeMany(t), count: n }));
  return { sample: false, days, weights, weeks, growth, mix };
}

export function buildInsights(passport: Passport, demo: boolean, now = Date.now()): Insights {
  if (!demo && passport.history.length >= REAL_THRESHOLD) return realInsights(passport, now);
  return sampleInsights(demo ? "pcp-demo" : passport.id, now);
}

export function weekDelta(values: number[]) {
  const last = values.slice(-7).reduce((a, b) => a + b, 0);
  const prev = values.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (!prev) return last ? null : 0;
  return Math.round(((last - prev) / prev) * 100);
}
