"use client";

import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "./AppProvider";

const KEY_SHAPE = /^[\w.-]{8,200}$/;
export const KEY_DOCS = "https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide";
export const JUDGES_BANNER = "Qloo key pending from organizers. Paste yours to try it live.";
export const FOCUS_EVENT = "pc:qloo-card";

export function focusQlooCard() {
  window.dispatchEvent(new Event(FOCUS_EVENT));
}

export function QlooKeyForm({ large = false }: { large?: boolean }) {
  const { setQlooKey } = useApp();
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (large) return;
    const onFocus = () => setTimeout(() => input.current?.focus({ preventScroll: true }), 320);
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, [large]);

  const connect = (e: FormEvent) => {
    e.preventDefault();
    const key = draft.trim();
    if (!key) {
      input.current?.focus();
      return;
    }
    if (!KEY_SHAPE.test(key)) {
      setError("That doesn’t look like a Qloo API key.");
      return;
    }
    setQlooKey(key);
    setDraft("");
    setShow(false);
    setError(null);
  };

  return (
    <>
      <form className={large ? "pc-qform pc-qform--lg" : "pc-qform"} onSubmit={connect}>
        <div className="pc-secret">
          <input
            ref={input}
            type={show ? "text" : "password"}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            placeholder="Qloo API key"
            autoComplete="off"
            spellCheck={false}
            aria-label="Qloo API key"
            aria-invalid={Boolean(error)}
          />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide key" : "Show key"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button className="pc-btn pc-btn--primary pc-btn--pill">Connect</button>
      </form>
      {error ? <p className="pc-qcard__error">{error}</p> : null}
    </>
  );
}

export function JudgesCopy() {
  return (
    <>
      <p className="pc-qcard__body">
        <span className="pc-qcard__judges">For judges</span> Our Qloo key hasn&apos;t arrived from the organizers yet. The integration uses Qloo&apos;s official harness and is
        auth-tested against hackathon.api.qloo.com. Paste your key to see live re-ranking.
      </p>
    </>
  );
}

export function QlooFine() {
  return (
    <a className="pc-link pc-qcard__link" href={KEY_DOCS} target="_blank" rel="noreferrer">
      Where do I get a key?
    </a>
  );
}

export function QlooCard() {
  const { qlooReady, qlooKey, setQlooKey, status } = useApp();
  const [pulse, setPulse] = useState(false);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFocus = () => {
      setTimeout(() => {
        card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setPulse(true);
        setTimeout(() => setPulse(false), 1600);
      }, 280);
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, []);

  if (status.state === "checking")
    return (
      <div className="pc-qloo-row pc-qloo-row--idle">
        <Loader2 size={15} className="pc-spin" aria-hidden />
        <span>Checking Qloo…</span>
      </div>
    );

  if (qlooReady || qlooKey)
    return (
      <div className="pc-qloo-row pc-qloo-row--on" role="status">
        <CheckCircle2 size={16} aria-hidden />
        <span className="pc-qloo-row__text">
          Qloo connected
          <small>{qlooReady ? "Server key" : "Your key · this tab only"}</small>
        </span>
        {!qlooReady ? (
          <button type="button" onClick={() => setQlooKey("")}>
            Disconnect
          </button>
        ) : null}
      </div>
    );

  return (
    <div ref={card} className={pulse ? "pc-qcard pc-qcard--pulse" : "pc-qcard"}>
      <div className="pc-qcard__head">
        <span className="pc-qcard__tile" aria-hidden>
          <KeyRound size={16} />
        </span>
        <strong>Connect Qloo taste intelligence</strong>
      </div>
      {status.state === "error" ? (
        <p className="pc-qcard__warn">
          <WifiOff size={13} aria-hidden />
          Server unreachable right now.
        </p>
      ) : null}
      <JudgesCopy />
      <QlooKeyForm />
      <QlooFine />
    </div>
  );
}
