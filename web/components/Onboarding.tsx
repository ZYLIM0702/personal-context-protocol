"use client";

import { ArrowLeft, Check, CheckCircle2, Gauge, KeyRound, Music, ShieldCheck, Sigma, Sparkles, Youtube } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildDeck, CATEGORIES, GOOGLE_DEMO, type DeckCard } from "@/lib/catalog";
import { plural, typeOne } from "@/lib/format";
import { addSignal, removeSignal } from "@/lib/pcp";
import { useApp } from "./AppProvider";
import { BrandMark } from "./Chrome";
import { PairPhone } from "./Devices";
import { PresetPicker } from "./Presets";
import { JudgesCopy, QlooFine, QlooKeyForm } from "./QlooCard";
import { SwipeDeck, type SwipeFace } from "./Swipe";

const STEPS = ["Welcome", "Connect Qloo", "Interests", "Build your PC", "Pair your phone", "Ready"];
const MIN_LOVES = 3;

function GoogleConsent({ onAllow, onClose }: { onAllow: () => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pc-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title" onClick={onClose}>
      <div className="pc-modal__card" onClick={(e) => e.stopPropagation()}>
        <span className="pc-demo-tag">Demo · no data leaves this page</span>
        <h2 id="consent-title">Import taste from Google</h2>
        <p className="pc-muted">PCP would read the artists and shows you follow and keep only their public names, on this device.</p>
        <ul className="pc-consent">
          <li>
            <Youtube size={16} aria-hidden />
            YouTube subscriptions
          </li>
          <li>
            <Music size={16} aria-hidden />
            YouTube Music likes
          </li>
        </ul>
        <p className="pc-fineprint">
          This stub adds sample items. The real flow would use the Google Data Portability API scopes{" "}
          <code>dataportability.youtube.subscriptions</code> and <code>dataportability.youtube.music</code>, or the YouTube
          Data API scope <code>youtube.readonly</code>.
        </p>
        <div className="pc-modal__actions">
          <button type="button" className="pc-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="pc-btn pc-btn--primary pc-btn--pill" onClick={onAllow}>
            Allow (demo)
          </button>
        </div>
      </div>
    </div>
  );
}

export function Onboarding() {
  const { onboarding, finishOnboarding, qlooReady, qlooKey, demo, passport, updatePassport, status } = useApp();
  const [step, setStep] = useState(onboarding ?? 1);
  const [picked, setPicked] = useState<string[]>(demo ? ["movie", "artist"] : []);
  const [google, setGoogle] = useState(false);
  const [consent, setConsent] = useState(false);
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<{ card: DeckCard; loved: boolean }[]>([]);
  const deck = useMemo(() => buildDeck(picked.length ? picked : ["movie", "artist"], google), [picked, google]);
  const loves = passport.signals.length;
  const connected = qlooReady || Boolean(qlooKey);

  useEffect(() => {
    if (step === 2 && qlooReady && onboarding !== 2) setStep(3);
  }, [step, qlooReady, onboarding]);

  const canContinue =
    step === 2 ? connected || Boolean(demo) : step === 3 ? picked.length > 0 || google : step === 4 ? loves >= MIN_LOVES : true;

  const next = () => {
    if (step === 6) return finishOnboarding();
    setStep((s) => (s === 1 && qlooReady ? 3 : s + 1));
  };
  const back = () => setStep((s) => (s === 3 && qlooReady ? 1 : Math.max(1, s - 1)));

  const seenNames = new Set(log.map((l) => l.card.name));
  const remaining = deck.slice(index).filter((c) => seenNames.has(c.name) || !passport.signals.some((s) => s.name === c.name));
  const faces: SwipeFace[] = remaining.map((c) => ({
    key: c.name,
    title: c.name,
    type: c.type,
    badge: c.source === "google" ? <span className="pc-swipe__google">From Google (demo)</span> : null,
    lines: <p>{c.blurb}</p>,
  }));

  const decide = (face: SwipeFace, loved: boolean) => {
    const card = deck.find((c) => c.name === face.key);
    if (!card) return;
    if (loved) updatePassport((d) => addSignal(d, card.name, card.type, "seed"));
    setLog((l) => [...l, { card, loved }]);
    setIndex((i) => i + 1);
  };
  const undo = () => {
    const last = log[log.length - 1];
    if (!last) return;
    if (last.loved) updatePassport((d) => removeSignal(d, last.card.name));
    setLog((l) => l.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
  };

  return (
    <div className="pc-onboard">
      <header className="pc-onboard__top">
        <BrandMark size={30} />
        <span className="pc-brand__text">
          <strong>PCP</strong>
          <span>Personal Context Protocol</span>
        </span>
        <span className="pc-grow" />
        {demo ? <span className="pc-pill pc-pill--demo">Demo mode</span> : null}
        <span className="pc-onboard__count">
          Step {step} of {STEPS.length}
        </span>
      </header>

      <main className="pc-onboard__main">
        <div className={step === 4 ? "pc-onboard__card pc-onboard__card--deck" : "pc-onboard__card"}>
          {step === 1 ? (
            <section className="pc-ostep">
              <BrandMark size={64} />
              <h1>Personalization, solved with math.</h1>
              <p className="pc-ostep__lede">
                Not more tokens. Your taste is learned on your device and shared with any agent as three numbers and a few
                public names.
              </p>
              <div className="pc-values">
                <div>
                  <Sigma size={20} aria-hidden />
                  <strong>Math, not tokens</strong>
                  <span>Naive Bayes, PageRank and a softmax layer. Zero LLM tokens for memory and ranking.</span>
                </div>
                <div>
                  <Gauge size={20} aria-hidden />
                  <strong>Efficient</strong>
                  <span>Your whole model is 3 weights plus a small graph, and it scores in milliseconds.</span>
                </div>
                <div>
                  <ShieldCheck size={20} aria-hidden />
                  <strong>Private</strong>
                  <span>It learns on your device, uses no personal data, and everything is end-to-end encrypted.</span>
                </div>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="pc-ostep">
              <span className="pc-ostep__tile" aria-hidden>
                <KeyRound size={24} />
              </span>
              <h1>Connect Qloo taste intelligence</h1>
              {connected ? (
                <div className="pc-qloo-row pc-qloo-row--on">
                  <CheckCircle2 size={16} aria-hidden />
                  <span className="pc-qloo-row__text">
                    Qloo connected
                    <small>{qlooReady ? "Server key" : "Your key · this tab only"}</small>
                  </span>
                </div>
              ) : (
                <div className="pc-ostep__qloo">
                  {status.state === "error" ? <p className="pc-note pc-note--err">Server unreachable right now.</p> : null}
                  <JudgesCopy />
                  <QlooKeyForm large />
                  <QlooFine />
                  {demo ? <p className="pc-muted">Demo mode: you can continue without a key.</p> : null}
                </div>
              )}
            </section>
          ) : null}

          {step === 3 ? (
            <section className="pc-ostep">
              <h1>What are you into?</h1>
              <p className="pc-ostep__lede">Pick a few categories. You’ll swipe through well-known names next.</p>
              <div className="pc-catchips" role="group" aria-label="Categories">
                {CATEGORIES.map((c) => {
                  const on = picked.includes(c.type);
                  return (
                    <button
                      key={c.type}
                      type="button"
                      className={on ? "pc-catchip on" : "pc-catchip"}
                      aria-pressed={on}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.type) : [...p, c.type]))}
                    >
                      {c.label}
                      {on ? <Check size={14} aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section className="pc-ostep pc-ostep--deck">
              <h1>Build your PC</h1>
              <p className="pc-ostep__lede">Start from a profile, then swipe to refine. You need at least {MIN_LOVES} loves.</p>
              <PresetPicker compact />
              <div className="pc-ostep__row">
                <button type="button" className="pc-google" onClick={() => setConsent(true)} disabled={google}>
                  <span className="pc-google__g" aria-hidden>
                    G
                  </span>
                  {google ? `Google connected (demo) · ${GOOGLE_DEMO.length} items` : "Continue with Google (demo)"}
                </button>
                <div className="pc-deck__progress" aria-live="polite">
                  <div className="pc-deck__dots" aria-hidden>
                    {Array.from({ length: MIN_LOVES }, (_, i) => (
                      <i key={i} className={i < loves ? "on" : ""} />
                    ))}
                  </div>
                  <span>{loves >= MIN_LOVES ? plural(loves, "love") : `${loves} of ${MIN_LOVES}`}</span>
                </div>
              </div>
              <SwipeDeck
                faces={faces}
                onDecide={decide}
                onUndo={undo}
                canUndo={log.length > 0}
                empty={
                  <>
                    <Sparkles size={22} aria-hidden />
                    <strong>That’s the whole deck</strong>
                    <span>{loves >= MIN_LOVES ? "Nice. Continue when ready." : "Go back and add a category, or undo."}</span>
                  </>
                }
              />
            </section>
          ) : null}

          {step === 5 ? (
            <section className="pc-ostep">
              <h1>Pair your phone</h1>
              <p className="pc-ostep__lede">Optional. Scan once to carry your PC to your phone, end-to-end encrypted.</p>
              <PairPhone auto={Boolean(demo)} />
            </section>
          ) : null}

          {step === 6 ? (
            <section className="pc-ostep">
              <div className="pc-ready" aria-hidden>
                <Check size={30} />
              </div>
              <h1>Your PC is ready</h1>
              <p className="pc-ostep__lede">
                {plural(loves, "love")} across {plural(new Set(passport.signals.map((s) => s.type)).size, "category", "categories")}.
                Every agent you ask is now re-ranked by your taste, on this device.
              </p>
              <ul className="pc-chips pc-chips--center">
                {[...passport.signals].reverse().slice(0, 10).map((s) => (
                  <li key={s.name} className="pc-chip-lg">
                    <span className="pc-chip-lg__name">{s.name}</span>
                    <span className="pc-chip-lg__meta">{typeOne(s.type)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </main>

      <footer className="pc-onboard__foot">
        <button type="button" className="pc-btn pc-btn--ghost" onClick={back} disabled={step === 1} style={{ visibility: step === 1 ? "hidden" : undefined }}>
          <ArrowLeft size={16} aria-hidden />
          Back
        </button>
        <ol className="pc-dots" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className={i + 1 === step ? "on" : i + 1 < step ? "done" : ""} aria-current={i + 1 === step ? "step" : undefined}>
              <span className="pc-sr">{label}</span>
            </li>
          ))}
        </ol>
        <div className="pc-onboard__next">
          {step === 5 ? (
            <button type="button" className="pc-btn pc-btn--ghost" onClick={next}>
              Skip
            </button>
          ) : null}
          <button type="button" className="pc-btn pc-btn--primary pc-btn--pill pc-btn--lg" onClick={next} disabled={!canContinue}>
            {step === 1 ? "Get started" : step === 6 ? "Open dashboard" : "Continue"}
          </button>
        </div>
      </footer>

      {consent ? (
        <GoogleConsent
          onClose={() => setConsent(false)}
          onAllow={() => {
            setGoogle(true);
            setConsent(false);
            setIndex(0);
          }}
        />
      ) : null}
    </div>
  );
}
