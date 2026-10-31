"use client";

import { defineComponent } from "@openuidev/react-lang";
import { Clock, FlaskConical, Music2, Square, Users, UtensilsCrossed } from "lucide-react";
import { z } from "zod/v4";
import { SIMULATED_LABEL } from "@/lib/demo";

const TrackSchema = z.object({
  title: z.string(),
  artist: z.string(),
  because: z.string().nullable().optional(),
  affinity: z.number().nullable().optional(),
});

const PlaylistSchema = z.object({
  title: z.string(),
  tracks: z.array(TrackSchema),
  note: z.string().nullable().optional(),
  simulated: z.boolean().optional(),
});

function Meter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="pc-mini-meter" title={`Qloo affinity ${value.toFixed(2)}`}>
      <span className="pc-mini-meter__track" aria-hidden>
        <i style={{ width: `${v * 100}%` }} />
      </span>
      <span className="pc-mini-meter__value">{value.toFixed(2)}</span>
    </span>
  );
}

export const Playlist = defineComponent({
  name: "Playlist",
  description:
    "Ordered music list. tracks: [{title, artist, because?, affinity?}]. because is the PC favorite that links to it; affinity is a Qloo affinity 0-1 from pcp_recommend results only, never invented.",
  props: PlaylistSchema,
  component: ({ props }) => (
    <section className="pc-kit pc-playlist">
      <header className="pc-kit__head">
        <span className="pc-kit__icon" aria-hidden>
          <Music2 size={18} />
        </span>
        <div>
          <strong>{props.title}</strong>
          <span>{props.tracks.length} tracks</span>
        </div>
      </header>
      {props.simulated ? (
        <div className="pc-banner pc-banner--sim" role="note">
          <FlaskConical size={15} aria-hidden />
          <span>{SIMULATED_LABEL}</span>
        </div>
      ) : null}
      <ol className="pc-playlist__rows">
        {props.tracks.map((t, i) => (
          <li key={`${t.title}-${i}`}>
            <span className="pc-playlist__n">{i + 1}</span>
            <div className="pc-playlist__main">
              <strong>{t.title}</strong>
              <span>{t.artist}</span>
              {t.because ? <em>Because you love {t.because}</em> : null}
            </div>
            {typeof t.affinity === "number" ? <Meter value={t.affinity} /> : null}
          </li>
        ))}
      </ol>
      {props.note ? <p className="pc-kit__note">{props.note}</p> : null}
    </section>
  ),
});

const ChecklistSchema = z.object({
  title: z.string(),
  items: z.array(z.object({ label: z.string(), qty: z.string().nullable().optional(), note: z.string().nullable().optional() })),
});

export const Checklist = defineComponent({
  name: "Checklist",
  description: "Read-only checklist of things to gather, with an optional quantity and note per item. items: [{label, qty?, note?}].",
  props: ChecklistSchema,
  component: ({ props }) => (
    <section className="pc-kit pc-checklist">
      <header className="pc-kit__subhead">{props.title}</header>
      <ul>
        {props.items.map((it, i) => (
          <li key={`${it.label}-${i}`}>
            <Square size={15} aria-hidden />
            <span className="pc-checklist__label">
              {it.label}
              {it.note ? <small>{it.note}</small> : null}
            </span>
            {it.qty ? <span className="pc-checklist__qty">{it.qty}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  ),
});

const RecipeSchema = z.object({
  title: z.string(),
  time: z.string(),
  servings: z.number(),
  ingredients: z.array(z.object({ item: z.string(), qty: z.string().nullable().optional() })),
  steps: z.array(z.string()),
  note: z.string().nullable().optional(),
  alternatives: z.array(z.string()).optional(),
});

export const Recipe = defineComponent({
  name: "Recipe",
  description:
    "Recipe card: title, time (e.g. '25 min'), servings, ingredients [{item, qty?}], ordered steps, an optional taste note tied to the user's PC, and up to 3 alternative dish names shown as text.",
  props: RecipeSchema,
  component: ({ props }) => (
    <section className="pc-kit pc-recipe">
      <header className="pc-kit__head">
        <span className="pc-kit__icon" aria-hidden>
          <UtensilsCrossed size={18} />
        </span>
        <div>
          <strong>{props.title}</strong>
          <span className="pc-recipe__meta">
            <span>
              <Clock size={13} aria-hidden /> {props.time}
            </span>
            <span>
              <Users size={13} aria-hidden /> Serves {props.servings}
            </span>
          </span>
        </div>
      </header>
      {props.note ? <p className="pc-recipe__note">{props.note}</p> : null}
      <div className="pc-recipe__grid">
        <div>
          <header className="pc-kit__subhead">Ingredients</header>
          <ul className="pc-recipe__ingredients">
            {props.ingredients.map((g, i) => (
              <li key={`${g.item}-${i}`}>
                <Square size={14} aria-hidden />
                <span>{g.item}</span>
                {g.qty ? <b>{g.qty}</b> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <header className="pc-kit__subhead">Method</header>
          <ol className="pc-recipe__steps">
            {props.steps.map((s, i) => (
              <li key={i}>
                <span>{i + 1}</span>
                <p>{s}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {props.alternatives?.length ? (
        <p className="pc-recipe__alts">
          Also good tonight: <span>{props.alternatives.join(" · ")}</span>
        </p>
      ) : null}
    </section>
  ),
});
