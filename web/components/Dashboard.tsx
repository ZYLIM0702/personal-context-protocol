"use client";

import { ArrowDownRight, ArrowUpRight, Ban, Heart, Layers, Minus } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getGraph, type GraphSnapshot } from "@/lib/api";
import { readCache } from "@/lib/cache";
import { EXAMPLE_MEMORY } from "@/lib/examples";
import { memoryEvents, readMemory } from "@/lib/memory";
import type { MemoryItem } from "@/lib/types";
import { DEMO_DISCOVER } from "@/lib/demo";
import { relativeTime, typeOne } from "@/lib/format";
import { buildInsights, REAL_THRESHOLD, weekDelta } from "@/lib/insights";
import { useApp } from "./AppProvider";
import { HowItLearns } from "./HowItLearns";
import { Page, Tag } from "./Page";

const VIOLET = "#6a3df0";
const VIOLET_LIGHT = "#c4b5fd";
const AMBER = "#d97706";
const TEAL = "#0d9488";
const GRID = "#eeecf4";
const AXIS = { fontSize: 11, fill: "#6b6b80" };
const TOOLTIP = {
  contentStyle: { borderRadius: 12, border: "1px solid #e8e5f0", boxShadow: "0 8px 24px rgba(52,31,120,.1)", fontSize: 12 },
  labelStyle: { color: "#151a2d", fontWeight: 600, marginBottom: 4 },
  cursor: { fill: "rgba(106,61,240,0.06)", stroke: "#d7cbfb" },
};

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ");
  return (
    <svg className="pc-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={`0,30 ${pts} 100,30`} fill="rgba(106,61,240,0.10)" stroke="none" />
      <polyline points={pts} fill="none" stroke={VIOLET} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="pc-delta pc-delta--up">new this week</span>;
  if (value === 0)
    return (
      <span className="pc-delta">
        <Minus size={12} aria-hidden />0% vs last week
      </span>
    );
  return (
    <span className={value > 0 ? "pc-delta pc-delta--up" : "pc-delta pc-delta--down"}>
      {value > 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
      {value > 0 ? "+" : ""}
      {value}% vs last week
    </span>
  );
}

function Kpi({ label, value, sub, series, delta }: { label: string; value: ReactNode; sub?: ReactNode; series: number[]; delta: number | null }) {
  return (
    <div className="pc-kpi">
      <span className="pc-kpi__label">{label}</span>
      <strong className="pc-kpi__value">{value}</strong>
      {sub ? <span className="pc-kpi__sub">{sub}</span> : null}
      <Sparkline values={series} />
      <Delta value={delta} />
    </div>
  );
}

function ChartCard({ title, caption, tag, className, children }: { title: string; caption?: string; tag?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={className ? `pc-chart ${className}` : "pc-chart"}>
      <header className="pc-chart__head">
        <div>
          <h2>{title}</h2>
          {caption ? <p>{caption}</p> : null}
        </div>
        {tag}
      </header>
      {children}
    </section>
  );
}

type Node = { id: string; name: string; type: string | null; score: number };

function demoGraph(names: { name: string; type: string }[]): GraphSnapshot {
  const nodes = [
    ...names.map((s, i) => ({ id: `s${i}`, name: s.name, type: s.type, score: 0.9 - i * 0.08 })),
    ...DEMO_DISCOVER.slice(0, 6).map((c, i) => ({ id: `d${i}`, name: c.name, type: c.type, score: 0.55 - i * 0.05 })),
  ];
  const edges = DEMO_DISCOVER.slice(0, 6).map((c, i) => ({
    a: nodes.find((n) => n.name === c.because)?.id ?? "s0",
    b: `d${i}`,
    kind: "qloo",
    w: c.qloo ?? 0.5,
  }));
  return { nodes, edges, totals: { nodes: nodes.length + 1, edges: edges.length + names.length } };
}

function MiniGraph({ graph }: { graph: GraphSnapshot }) {
  const top = [...graph.nodes].filter((n) => n.name).sort((a, b) => b.score - a.score).slice(0, 10);
  const W = 320;
  const H = 230;
  const cx = W / 2;
  const cy = H / 2;
  const pos = new Map<string, { x: number; y: number; n: Node }>();
  top.forEach((n, i) => {
    const ring = i < 5 ? 62 : 100;
    const k = i < 5 ? i / 5 : (i - 5) / Math.max(1, top.length - 5);
    const angle = k * Math.PI * 2 - Math.PI / 2 + (i < 5 ? 0 : 0.6);
    pos.set(n.id, { x: cx + Math.cos(angle) * ring * 1.35, y: cy + Math.sin(angle) * ring * 0.82, n });
  });
  const links = graph.edges.filter((e) => pos.has(e.a) && pos.has(e.b)).slice(0, 24);
  return (
    <svg className="pc-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Your PC graph: you, your loves and the options they link to">
      {top.slice(0, 5).map((n) => {
        const p = pos.get(n.id)!;
        return <line key={`c${n.id}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#d7cbfb" strokeWidth="1.5" />;
      })}
      {links.map((e, i) => {
        const a = pos.get(e.a)!;
        const b = pos.get(e.b)!;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e4def7" strokeWidth="1.2" />;
      })}
      <circle cx={cx} cy={cy} r={17} fill={VIOLET} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
        You
      </text>
      {[...pos.values()].map(({ x, y, n }, i) => (
        <g key={n.id}>
          <circle cx={x} cy={y} r={i < 5 ? 7 : 5} fill={i < 5 ? VIOLET : "#fff"} stroke={VIOLET} strokeWidth="1.5" />
          <text x={x} y={y + (y < cy ? -11 : 17)} textAnchor="middle" fontSize="10" fill="#151a2d">
            {n.name.length > 16 ? `${n.name.slice(0, 15)}…` : n.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function LearnedFromChat() {
  const { passport, demo } = useApp();
  const [items, setItems] = useState<MemoryItem[]>(() => (demo ? [] : readMemory(passport.id)));
  useEffect(() => {
    const onLearn = (e: Event) => {
      const learned = (e as CustomEvent<MemoryItem[]>).detail ?? [];
      setItems((list) => (demo ? [...learned, ...list] : readMemory(passport.id)));
    };
    memoryEvents.addEventListener("learned", onLearn);
    return () => memoryEvents.removeEventListener("learned", onLearn);
  }, [demo, passport.id]);
  const shown = demo ? [...items, ...EXAMPLE_MEMORY] : items;
  return (
    <ChartCard
      title="Learned from chat"
      caption="Picked up from what you said in Ask. No LLM tokens."
      tag={demo ? <Tag tone="warn">Example</Tag> : null}
      className="pc-col-4"
    >
      {shown.length ? (
        <ul className="pc-memory">
          {shown.slice(0, 6).map((m, i) => (
            <li key={`${m.name}-${i}`}>
              <span className={m.liked ? "pc-memory__icon" : "pc-memory__icon pc-memory__icon--no"} aria-hidden>
                {m.liked ? <Heart size={14} /> : <Ban size={14} />}
              </span>
              <div>
                <strong>
                  {m.name} <span>{typeOne(m.type)}</span>
                </strong>
                {m.evidence ? <q>{m.evidence}</q> : null}
                <small>
                  {m.liked ? "Added to favorites" : "Hidden from agents"} · {m.source === "follow-up" ? "follow-up" : "chat"}
                  {m.verified ? " · matched by Qloo" : ""}
                  {m.at ? ` · ${relativeTime(m.at)}` : " · example"}
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pc-empty">Nothing yet. Mention something you love or can’t stand in Ask and it lands here.</p>
      )}
    </ChartCard>
  );
}

export function Dashboard() {
  const { passport, demo, navigate } = useApp();
  const insights = useMemo(() => buildInsights(passport, Boolean(demo)), [passport, demo]);
  const [graph, setGraph] = useState<GraphSnapshot | null>(null);

  useEffect(() => {
    if (demo) return;
    let live = true;
    getGraph(passport.id)
      .then((g) => live && setGraph(g))
      .catch(() => live && setGraph(null));
    return () => {
      live = false;
    };
  }, [passport.id, passport.signals.length, demo]);

  const sampleTag = insights.sample ? <Tag tone="warn">{demo ? "Demo data" : "Sample data"}</Tag> : null;
  const shownGraph = graph && graph.nodes.length ? graph : demoGraph(passport.signals.slice(-5).reverse());
  const graphSample = !graph || !graph.nodes.length;
  const swipes = insights.days.map((d) => d.swipes);
  const loves = insights.days.map((d) => d.loves);
  const skips = insights.days.map((d) => d.skips);
  const scored = insights.days.map((d) => d.qloo);
  const nodesSeries = insights.growth.map((g) => g.nodes);
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const totals = insights.sample
    ? { loves: sum(loves), vetoes: sum(skips), scored: sum(scored) }
    : {
        loves: passport.signals.length,
        vetoes: passport.vetoes.length,
        scored: passport.history.filter((h) => h.liked && typeof h.qloo === "number").length,
      };
  const answers = demo
    ? 0
    : Object.values(readCache(passport.id).turns).reduce((n, turns) => n + turns.filter((t) => t.role === "agent").length, 0);
  const tokenSeries = insights.days.map((d) => (d.swipes + (insights.sample ? Math.round(d.swipes / 4) : 0)) * 2000);
  const tokensSaved = insights.sample ? sum(tokenSeries) : (answers + passport.history.length) * 2000;
  const graphTotals = graphSample ? { nodes: insights.growth.at(-1)?.nodes ?? 0, edges: insights.growth.at(-1)?.edges ?? 0 } : graph!.totals;
  const topNodes = [...shownGraph.nodes].filter((n) => n.name && n.id !== "user" && !n.vetoed).sort((a, b) => b.score - a.score).slice(0, 6);
  const maxScore = Math.max(0.0001, ...topNodes.map((n) => n.score));

  return (
    <Page
      title="Dashboard"
      lede="Your Personal Context at a glance: what you love, how your on-device model is learning, and how your PC graph grows."
      wide
      actions={
        <button type="button" className="pc-btn pc-btn--primary pc-btn--pill" onClick={() => navigate("discover")}>
          <Layers size={16} aria-hidden />
          Train in Discover
        </button>
      }
    >
      {insights.sample ? (
        <p className="pc-sample-note">
          {demo
            ? "Demo data: three weeks of synthesized activity so every chart is populated."
            : `Charts show sample data until you have ${REAL_THRESHOLD} swipes (you have ${passport.history.length}). Your counts and graph are real.`}
        </p>
      ) : null}

      <div className="pc-kpis">
        <Kpi label="Loves" value={totals.loves} series={loves} delta={weekDelta(loves)} />
        <Kpi label="Vetoes" value={totals.vetoes} series={skips} delta={weekDelta(skips)} />
        <Kpi label="Swipes this week" value={sum(swipes.slice(-7))} series={swipes} delta={weekDelta(swipes)} />
        <Kpi
          label="PC graph"
          value={graphTotals.nodes}
          sub={`nodes · ${graphTotals.edges} edges`}
          series={nodesSeries}
          delta={weekDelta(nodesSeries.map((v, i) => v - (nodesSeries[i - 1] ?? v)))}
        />
        <Kpi label="Qloo-scored picks" value={totals.scored} series={scored} delta={weekDelta(scored)} />
        <Kpi
          label="LLM tokens saved"
          value={tokensSaved >= 1000 ? `${(tokensSaved / 1000).toFixed(tokensSaved >= 100000 ? 0 : 1)}k` : tokensSaved}
          sub="estimate · 2,000 per answer or swipe"
          series={tokenSeries}
          delta={weekDelta(tokenSeries)}
        />
      </div>

      <div className="pc-dash">
        <ChartCard title="Activity over time" caption="Swipes per day, last 30 days" tag={sampleTag} className="pc-col-8">
          <div className="pc-chart__plot">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.days} margin={{ top: 8, right: 8, bottom: 4, left: -12 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} label={{ value: "swipes", angle: -90, position: "insideLeft", offset: 20, style: AXIS }} />
                <Tooltip {...TOOLTIP} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#6b6b80" }} />
                <Bar dataKey="loves" name="Loves" stackId="a" fill={VIOLET} />
                <Bar dataKey="skips" name="Skips" stackId="a" fill={VIOLET_LIGHT} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Taste mix" caption="Loves by category" tag={insights.sample || !insights.mix.length ? sampleTag : null} className="pc-col-4">
          <div className="pc-chart__plot">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.mix} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={74} />
                <Tooltip {...TOOLTIP} />
                <Bar dataKey="count" name="Loves" fill={VIOLET} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="How your model is learning" caption="Learned weights after each day of swipes" tag={sampleTag} className="pc-col-8">
          <div className="pc-chart__plot">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={insights.weights} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={["auto", "auto"]} label={{ value: "weight", angle: -90, position: "insideLeft", offset: 20, style: AXIS }} />
                <Tooltip {...TOOLTIP} formatter={(v) => Number(v).toFixed(2)} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#6b6b80" }} />
                <Line type="monotone" dataKey="agent" name="Agent prior" stroke={AMBER} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="qloo" name="Qloo taste" stroke={TEAL} strokeWidth={2} dot={false} strokeDasharray="6 3" />
                <Line type="monotone" dataKey="graph" name="PC graph" stroke={VIOLET} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Top of your PC" caption="Strongest nodes by Personalized PageRank" tag={graphSample ? sampleTag ?? <Tag tone="warn">From your loves</Tag> : null} className="pc-col-4">
          <ol className="pc-toplist">
            {topNodes.map((n) => (
              <li key={n.id}>
                <div>
                  <strong>{n.name}</strong>
                  <span>{typeOne(n.type)}</span>
                </div>
                <span className="pc-toplist__bar">
                  <i style={{ width: `${(n.score / maxScore) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </ChartCard>

        <ChartCard title="Match quality" caption="Average Qloo affinity of loved picks, per week" tag={sampleTag} className="pc-col-4">
          <div className="pc-chart__plot pc-chart__plot--sm">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={insights.weeks} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v: string) => v.replace("Wk of ", "")} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[0, 1]} label={{ value: "affinity", angle: -90, position: "insideLeft", offset: 20, style: AXIS }} />
                <Tooltip {...TOOLTIP} formatter={(v) => (v == null ? "no loves" : Number(v).toFixed(2))} />
                <Line type="monotone" dataKey="affinity" name="Avg Qloo affinity" stroke={VIOLET} strokeWidth={2} dot={{ r: 4, fill: VIOLET, stroke: "#fff", strokeWidth: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="PC graph growth" caption="Nodes and edges over time" tag={sampleTag} className="pc-col-4">
          <div className="pc-chart__plot pc-chart__plot--sm">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={insights.growth} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} label={{ value: "count", angle: -90, position: "insideLeft", offset: 20, style: AXIS }} />
                <Tooltip {...TOOLTIP} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#6b6b80" }} />
                <Area type="monotone" dataKey="edges" name="Edges" stroke={TEAL} fill={TEAL} fillOpacity={0.08} strokeWidth={2} />
                <Area type="monotone" dataKey="nodes" name="Nodes" stroke={VIOLET} fill={VIOLET} fillOpacity={0.14} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <LearnedFromChat />

        <ChartCard title="Your PC graph" caption="You, your loves and what they link to" tag={graphSample ? sampleTag ?? <Tag tone="warn">From your loves</Tag> : null} className="pc-col-4">
          <MiniGraph graph={shownGraph} />
        </ChartCard>

        <div className="pc-col-8">
          <HowItLearns />
        </div>
      </div>
    </Page>
  );
}
