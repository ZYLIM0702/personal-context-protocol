"use client";

import { Sigma, Sparkles } from "lucide-react";
import { useApp } from "./AppProvider";

export function HowItLearns({ compact = false }: { compact?: boolean }) {
  const { passport } = useApp();
  const w = [0, 1, 2].map((k) => (passport.policy.weights[k] ?? 1).toFixed(2));
  const steps = [
    ["Intent", "A Naive Bayes classifier reads your message and picks the category. No LLM."],
    ["Taste", "Qloo’s taste graph scores how close each option is to what you love."],
    ["Memory", "Your PC graph links you, your loves, Qloo taste links and co-likes; Personalized PageRank scores every option."],
    ["Ranking", `A conditional-logit layer combines agent prior, Qloo taste and PC graph with your weights [${w.join(", ")}].`],
    ["Learning", "Each swipe is one gradient step on your device and adds an edge to your graph."],
  ] as const;
  return (
    <section className={compact ? "pc-learn pc-learn--compact" : "pc-learn"} aria-label="Math, not tokens">
      <header className="pc-learn__head">
        <span className="pc-panel__icon" aria-hidden>
          <Sigma size={16} />
        </span>
        <h2>Math, not tokens</h2>
        <span className="pc-badge">
          <Sparkles size={13} aria-hidden />0 LLM tokens
        </span>
      </header>
      <div className="pc-formulas" aria-label="Formulas">
        <div>
          <span>Rank</span>
          <code>
            p<sub>i</sub> = softmax(w · x<sub>i</sub>)
          </code>
        </div>
        <div>
          <span>Learn</span>
          <code>
            w ← w ± η (x<sub>c</sub> − E<sub>p</sub>[x])
          </code>
        </div>
        <div>
          <span>Remember</span>
          <code>
            r = α e<sub>you</sub> + (1 − α) r P
          </code>
        </div>
      </div>
      <ol className="pc-learn__steps">
        {steps.map(([title, body], i) => (
          <li key={title}>
            <span className="pc-learn__n">{i + 1}</span>
            <div>
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="pc-learn__foot">
        Live weights w = [{w.join(", ")}] · {passport.policy.updates} updates · η = {passport.policy.lr}
      </p>
    </section>
  );
}
