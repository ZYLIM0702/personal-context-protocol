import { addSignal, createPassport, feedback, type Candidate, type Passport } from "./pcp";
import type { DiscoverCard, Turn } from "./types";

export const SIMULATED_LABEL = "SIMULATED DEMO: illustrative affinity values, not Qloo output.";

export const DEMO_TASK = "Something to watch on a Friday night";

export const DEMO_SIGNALS: [string, string][] = [
  ["Radiohead", "artist"],
  ["Arrival", "movie"],
  ["Spirited Away", "movie"],
];

const PICKS: [string, number, number, string, string | null][] = [
  ["The Shawshank Redemption", 0.22, 0.31, "A hopeful prison drama that rewards patience.", null],
  ["Inception", 0.18, 0.62, "A twisty heist through layered dreams.", "Arrival"],
  ["The Dark Knight", 0.16, 0.28, "A tense, operatic superhero crime story.", null],
  ["Interstellar", 0.12, 0.66, "Big-hearted space epic about time and family.", "Arrival"],
  ["Pulp Fiction", 0.1, 0.35, "Sharp, nonlinear crime stories with great dialogue.", null],
  ["Her", 0.08, 0.84, "A tender near-future love story with an AI.", "Arrival"],
  ["Ex Machina", 0.08, 0.79, "A quiet, unsettling chamber piece about AI.", "Arrival"],
  ["Moon", 0.06, 0.81, "Lonely, melancholic sci-fi with a stunning lead.", "Radiohead"],
];

export const DEMO_CANDIDATES: Candidate[] = PICKS.map(([name, prior, qloo, why, because]) => ({
  name,
  prior,
  qloo,
  qloo_kind: "affinity",
  qloo_match: name,
  qloo_entity_id: null,
  why,
  because,
}));

export const DEMO_DISCOVER: DiscoverCard[] = (
  [
    ["Princess Mononoke", "movie", 0.86, "Spirited Away"],
    ["Portishead", "artist", 0.78, "Radiohead"],
    ["Blade Runner 2049", "movie", 0.81, "Arrival"],
    ["Howl's Moving Castle", "movie", 0.83, "Spirited Away"],
    ["Sigur Rós", "artist", 0.72, "Radiohead"],
    ["Annihilation", "movie", 0.74, "Arrival"],
    ["Your Name", "movie", 0.8, "Spirited Away"],
    ["Bon Iver", "artist", 0.66, "Radiohead"],
    ["Contact", "movie", 0.69, "Arrival"],
    ["Massive Attack", "artist", 0.7, "Radiohead"],
  ] as [string, string, number, string][]
).map(([name, type, qloo, because]) => ({ name, type, qloo, qloo_kind: "affinity", graph: null, because }));

export const DEMO_TURNS: Turn[] = [
  { role: "user", text: DEMO_TASK, type: "movie" },
  {
    role: "agent",
    task: DEMO_TASK,
    result: {
      type: "movie",
      reply: "Here are a few films for a Friday night, ranked by your PC.",
      provider: "openai",
      model: "gpt-5.6-luna",
      candidates: DEMO_CANDIDATES,
      qloo: { status: "simulated", summary: SIMULATED_LABEL },
    },
  },
];

export const LOCAL_DEMO_ID = "local-demo-friday-night";

export type DemoConfig = { step: 1 | 2 };

export function readDemo(search: string): DemoConfig | null {
  const params = new URLSearchParams(search);
  if (!params.has("demo") || params.get("demo") === "0") return null;
  return { step: params.get("step") === "2" ? 2 : 1 };
}

export function demoPassport(demo: DemoConfig): Passport {
  const p = createPassport();
  for (const [name, type] of DEMO_SIGNALS) addSignal(p, name, type, "seed");
  if (demo.step === 2) {
    feedback(p, DEMO_CANDIDATES, "Her", true, "movie");
    feedback(p, DEMO_CANDIDATES, "The Dark Knight", false, "movie");
  }
  return p;
}
