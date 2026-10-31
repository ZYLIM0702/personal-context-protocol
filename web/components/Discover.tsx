"use client";

import { FlaskConical, KeyRound, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, discover, graphFeedback } from "@/lib/api";
import { DEMO_DISCOVER, SIMULATED_LABEL } from "@/lib/demo";
import { plural } from "@/lib/format";
import { disclose, feedback, type Candidate, type Passport } from "@/lib/pcp";
import type { DiscoverCard } from "@/lib/types";
import { useApp } from "./AppProvider";
import { HowItLearns } from "./HowItLearns";
import { Page } from "./Page";
import { focusQlooCard, JUDGES_BANNER } from "./QlooCard";
import { SwipeDeck, type SwipeFace } from "./Swipe";

const FILTERS: [string, string][] = [
  ["all", "All"],
  ["movie", "Movies"],
  ["artist", "Music"],
  ["tv_show", "TV"],
  ["book", "Books"],
  ["podcast", "Podcasts"],
  ["place", "Places"],
  ["brand", "Brands"],
];

type DeckState =
  | { kind: "loading" }
  | { kind: "ready"; cards: DiscoverCard[]; tokens: number; simulated: boolean }
  | { kind: "blocked" }
  | { kind: "error"; message: string };

function Meter({ card }: { card: DiscoverCard }) {
  if (typeof card.qloo !== "number") return <p className="pc-meter__none">Not scored by Qloo</p>;
  const value = Math.max(0, Math.min(1, card.qloo));
  const label = card.qloo_kind === "rank" ? "Qloo rank" : "Qloo affinity";
  return (
    <div className="pc-meter">
      <div className="pc-meter__top">
        <span>{label}</span>
        <b>{card.qloo.toFixed(2)}</b>
      </div>
      <div className="pc-meter__track" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-label={label}>
        <i style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

export function Discover() {
  const { passport, updatePassport, replacePassport, runtime, demo, gate, qlooKey } = useApp();
  const [filter, setFilter] = useState("all");
  const [state, setState] = useState<DeckState>({ kind: "loading" });
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<{ card: DiscoverCard; prev: Passport }[]>([]);
  const loves = useRef(0);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    setIndex(0);
    setLog([]);
    const p = runtime.current.passport;
    const type = filter === "all" ? undefined : filter;
    try {
      const r = await discover({ passport: disclose(p), pcId: p.id, type, qlooKey: runtime.current.qlooKey || undefined });
      setState({ kind: "ready", cards: r.cards ?? [], tokens: r.llm_tokens ?? 0, simulated: false });
    } catch (error) {
      if (runtime.current.demo) {
        const cards = DEMO_DISCOVER.filter((c) => !type || c.type === type);
        setState({ kind: "ready", cards, tokens: 0, simulated: true });
        return;
      }
      if (error instanceof ApiError && error.status === 412) setState({ kind: "blocked" });
      else setState({ kind: "error", message: (error as Error).message });
    }
  }, [filter, runtime]);

  useEffect(() => {
    if (!demo && gate === "blocked") {
      setState({ kind: "blocked" });
      return;
    }
    if (gate === "checking") return;
    void load();
  }, [load, gate, qlooKey, demo]);

  const cards = state.kind === "ready" ? state.cards : [];
  const remaining = cards.slice(index);
  const faces = useMemo<SwipeFace[]>(
    () =>
      remaining.map((c) => ({
        key: c.name,
        title: c.name,
        type: c.type,
        badge: null,
        lines: c.because ? (
          <p className="pc-swipe__because">
            Because you love <b>{c.because}</b>
          </p>
        ) : (
          <p>Suggested from Qloo’s taste graph for your PC.</p>
        ),
        meter: <Meter card={c} />,
      })),
    [remaining],
  );

  const onDecide = (face: SwipeFace, loved: boolean) => {
    const card = cards.find((c) => c.name === face.key);
    if (!card) return;
    const prev = runtime.current.passport;
    const candidates: Candidate[] = cards.map((c) => ({ name: c.name, prior: 1, qloo: c.qloo ?? null, graph: c.graph ?? null }));
    updatePassport((d) => {
      feedback(d, candidates, card.name, loved, card.type);
      if (d.history[0]?.name === card.name) d.history[0] = { ...d.history[0], qloo: card.qloo ?? null };
    });
    if (!demo)
      void graphFeedback({
        pc_id: prev.id,
        task: "discover",
        type: card.type,
        name: card.name,
        liked: loved,
        shown: cards.slice(index).map((c) => c.name),
      }).catch(() => undefined);
    if (loved) loves.current += 1;
    setLog((l) => [...l, { card, prev }]);
    setIndex((i) => i + 1);
  };

  const onUndo = () => {
    const last = log[log.length - 1];
    if (!last) return;
    replacePassport(last.prev);
    setLog((l) => l.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
  };

  return (
    <Page
      title="Discover"
      lede="Swipe to teach your PC. Right to love, left to skip. Cards come from Qloo’s taste graph and your PC graph, with no LLM in the loop."
      wide
    >
      <div className="pc-discover">
        <div className="pc-discover__main">
          <div className="pc-filters" role="tablist" aria-label="Category">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={filter === id ? "pc-filter pc-filter--on" : "pc-filter"}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="pc-discover__meta">
            <span className="pc-badge">
              <Sparkles size={13} aria-hidden />
              {state.kind === "ready" ? state.tokens : 0} LLM tokens
            </span>
            {state.kind === "ready" ? <span>{plural(remaining.length, "card")} left</span> : null}
            <span>{plural(passport.signals.length, "love")} in your PC</span>
          </div>

          {state.kind === "ready" && state.simulated ? (
            <div className="pc-banner pc-banner--sim" role="note">
              <FlaskConical size={15} aria-hidden />
              <span>{SIMULATED_LABEL}</span>
            </div>
          ) : null}

          {state.kind === "loading" ? (
            <div className="pc-deck">
              <div className="pc-deck__stack">
                <div className="pc-swipe pc-skeleton" aria-label="Loading cards" />
              </div>
            </div>
          ) : state.kind === "blocked" ? (
            <div className="pc-state">
              <span className="pc-state__icon" aria-hidden>
                <KeyRound size={20} />
              </span>
              <strong>Discover needs Qloo</strong>
              <p>{JUDGES_BANNER}</p>
              <button type="button" className="pc-btn pc-btn--primary pc-btn--pill" onClick={focusQlooCard}>
                Connect Qloo in the sidebar
              </button>
            </div>
          ) : state.kind === "error" ? (
            <div className="pc-state">
              <strong>Couldn’t load cards</strong>
              <p>{state.message}</p>
              <button type="button" className="pc-btn pc-btn--pill" onClick={() => void load()}>
                <RefreshCw size={15} aria-hidden />
                Try again
              </button>
            </div>
          ) : (
            <SwipeDeck
              faces={faces}
              onDecide={onDecide}
              onUndo={onUndo}
              canUndo={log.length > 0}
              empty={
                <>
                  <Sparkles size={22} aria-hidden />
                  <strong>{cards.length ? "You’ve seen this deck" : "No cards for this filter yet"}</strong>
                  <span>Load more to get fresh picks shaped by what you just taught your PC.</span>
                  <button type="button" className="pc-btn pc-btn--primary pc-btn--pill" onClick={() => void load()}>
                    <RefreshCw size={15} aria-hidden />
                    Load more
                  </button>
                </>
              }
            />
          )}
        </div>
        <aside className="pc-discover__side">
          <HowItLearns />
        </aside>
      </div>
    </Page>
  );
}
