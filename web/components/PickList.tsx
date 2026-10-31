"use client";

import { defineComponent } from "@openuidev/react-lang";
import { FlaskConical } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod/v4";
import { SIMULATED_LABEL } from "@/lib/demo";
import { typeMany, typeOne } from "@/lib/format";
import { distribution, sameName, type Candidate } from "@/lib/pcp";
import { useApp } from "./AppProvider";

const CandidateSchema = z.object({
  name: z.string(),
  prior: z.number(),
  qloo: z.number().nullable(),
  kind: z.string().nullable().optional(),
  match: z.string().nullable().optional(),
  graph: z.number().nullable().optional(),
  why: z.string().nullable().optional(),
  because: z.string().nullable().optional(),
});

const QlooSchema = z.object({
  status: z.string(),
  summary: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  trace: z.string().nullable().optional(),
  unresolved: z
    .array(z.object({ input: z.string(), field: z.string(), candidates: z.array(z.string()).optional() }))
    .optional(),
});

const PickListSchema = z.object({
  type: z.string(),
  task: z.string(),
  agent: z.string(),
  candidates: z.array(CandidateSchema),
  qloo: QlooSchema.optional(),
  inferred: z.object({ type: z.string(), confidence: z.number() }).nullable().optional(),
});

type PickListProps = z.infer<typeof PickListSchema>;

const LIVE = ["ok", "partial", "degraded"];
const SHOW = 5;

function matchLabel(c: Candidate) {
  if (typeof c.qloo !== "number") return "Not scored by Qloo";
  return `${c.qloo_kind === "rank" ? "Qloo rank" : "Qloo match"} ${c.qloo.toFixed(2)}`;
}

function PickListView({ props }: { props: PickListProps }) {
  const { passport } = useApp();
  const candidates = useMemo<Candidate[]>(
    () =>
      (props.candidates ?? []).map((c) => ({
        name: c.name,
        prior: c.prior,
        qloo: c.qloo,
        qloo_kind: c.kind ?? null,
        qloo_match: c.match ?? null,
        graph: c.graph ?? null,
        why: c.why ?? null,
        because: c.because ?? null,
      })),
    [props.candidates],
  );
  const rows = useMemo(() => distribution(passport, candidates), [passport, candidates]);
  const top = rows.slice(0, SHOW);
  const status = props.qloo?.status ?? "unknown";
  const unresolved = props.qloo?.unresolved ?? [];
  const saved = (name: string) => passport.signals.some((s) => sameName(s.name, name));

  return (
    <section className="pc-answer" aria-label={`${typeMany(props.type)} picks`}>
      {status === "simulated" ? (
        <div className="pc-banner pc-banner--sim" role="note">
          <FlaskConical size={15} aria-hidden />
          <span>{SIMULATED_LABEL}</span>
        </div>
      ) : null}

      <ol className="pc-cards">
        {top.map((r, i) => (
          <li key={r.name} className="pc-card">
            <span className="pc-card__index" aria-hidden>
              {i + 1}
            </span>
            <div className="pc-card__body">
              <div className="pc-card__top">
                <h4>{r.name}</h4>
                <span className="pc-card__type">{typeOne(props.type)}</span>
                {saved(r.name) ? <span className="pc-card__saved">In your PC</span> : null}
              </div>
              {r.why ? <p className="pc-card__why">{r.why}</p> : null}
              {r.because ? <p className="pc-card__because">Because you love {r.because}</p> : null}
              <p className="pc-card__detail">{matchLabel(r)}</p>
            </div>
          </li>
        ))}
      </ol>

      {status !== "simulated" && !LIVE.includes(status) ? (
        <p className="pc-answer__note">
          {status === "empty"
            ? "Your PC has no taste signals yet, so these follow the agent’s own order. Swipe a few in Discover."
            : `Qloo couldn’t score these (${props.qloo?.error || status}), so they follow the agent’s own order.`}
        </p>
      ) : null}

      {unresolved.length ? (
        <p className="pc-answer__note">
          Qloo couldn’t match:{" "}
          {unresolved
            .map((u) => `${u.input}${u.candidates?.length ? ` (did you mean ${u.candidates.join(", ")}?)` : ""}`)
            .join("; ")}
        </p>
      ) : null}

      <footer className="pc-answer__foot">
        <span className="pc-answer__type">
          {typeMany(props.type)}
          {props.inferred ? " · detected" : ""}
        </span>
        <span>Ordered on your device by your PC · {props.agent}</span>
      </footer>
      <p className="pc-answer__fine">Qloo match is an aggregate taste signal; the order is your on-device model’s ranking.</p>
    </section>
  );
}

export const PickList = defineComponent({
  name: "PickList",
  description:
    "Top picks for one entity type, as clean cards with the agent's short reason and the PC graph link, ordered by the user's on-device model. Read-only.",
  props: PickListSchema,
  component: PickListView,
});
