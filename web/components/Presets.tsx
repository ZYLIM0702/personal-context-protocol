"use client";

import { Check, ChefHat, Clapperboard, Hammer, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { PRESETS, type Preset } from "@/lib/presets";
import { addSignal, sameName } from "@/lib/pcp";
import { useApp } from "./AppProvider";

const ICONS: Record<Preset["icon"], ReactNode> = {
  film: <Clapperboard size={18} />,
  chef: <ChefHat size={18} />,
  hammer: <Hammer size={18} />,
  spark: <Sparkles size={18} />,
};

export function PresetPicker({ compact = false }: { compact?: boolean }) {
  const { passport, updatePassport } = useApp();
  const applied = (p: Preset) => p.signals.every(([name]) => passport.signals.some((s) => sameName(s.name, name)));
  const apply = (p: Preset) =>
    updatePassport((d) => {
      for (const [name, type] of p.signals) addSignal(d, name, type, "seed");
    });
  return (
    <div className={compact ? "pc-presets pc-presets--compact" : "pc-presets"} role="list" aria-label="Starter taste profiles">
      {PRESETS.map((p) => {
        const on = applied(p);
        return (
          <button
            key={p.id}
            type="button"
            role="listitem"
            className={on ? "pc-preset pc-preset--on" : "pc-preset"}
            aria-pressed={on}
            title={p.signals.map(([n]) => n).join(", ")}
            onClick={() => apply(p)}
          >
            <span className="pc-preset__icon" aria-hidden>
              {on ? <Check size={18} /> : ICONS[p.icon]}
            </span>
            <span className="pc-preset__body">
              <strong>{p.title}</strong>
              <span>{compact ? `${p.blurb} · ${p.signals.length} favorites` : p.signals.map(([n]) => n).join(" · ")}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
