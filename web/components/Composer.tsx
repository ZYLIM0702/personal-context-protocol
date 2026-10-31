"use client";

import { useThread, useThreadList } from "@openuidev/react-headless";
import { ArrowUp, ChefHat, Clapperboard, Hammer, Headphones, KeyRound, Lock, Square } from "lucide-react";
import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isDemoConversation } from "@/lib/chat";
import { useApp } from "./AppProvider";
import { BrandMark } from "./Chrome";
import { focusQlooCard, JUDGES_BANNER } from "./QlooCard";

function useSend() {
  const processMessage = useThread((s) => s.processMessage);
  const selected = useThreadList((s) => s.selectedThreadId);
  const switchToNewThread = useThreadList((s) => s.switchToNewThread);
  const { runtime } = useApp();
  return (text: string, type: string | null = null) => {
    if (isDemoConversation(selected)) switchToNewThread();
    runtime.current.pendingType = type;
    void processMessage({ role: "user", content: text });
  };
}

function lockedText(gate: string) {
  if (gate === "checking") return "Checking Qloo…";
  if (gate === "error") return "Server unreachable. Check that it is running.";
  return "Connect Qloo in the sidebar to start";
}

export function ChatComposer({ hero = false }: { hero?: boolean }) {
  const { gate } = useApp();
  const locked = gate !== "ready";
  const isRunning = useThread((s) => s.isRunning);
  const cancelMessage = useThread((s) => s.cancelMessage);
  const send = useSend();
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "";
    if (text) el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || isRunning || locked) return;
    setText("");
    send(value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };

  return (
    <form
      className={`pc-composer${hero ? " pc-composer--hero" : ""}${locked ? " pc-composer--locked" : ""}`}
      onSubmit={submit}
    >
      <div className="pc-composer__box" onClick={locked && gate === "blocked" ? focusQlooCard : undefined}>
        {locked ? <Lock size={16} className="pc-composer__lock" aria-hidden /> : null}
        <textarea
          ref={box}
          rows={hero ? 2 : 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            locked
              ? lockedText(gate)
              : hero
                ? "Ask anything: a playlist, a recipe, a weekend project…"
                : "Ask a follow-up or something new…"
          }
          aria-label="Message"
          maxLength={200}
          disabled={locked}
        />
        {isRunning ? (
          <button type="button" className="pc-send pc-send--stop" onClick={cancelMessage} aria-label="Stop">
            <Square size={14} />
          </button>
        ) : (
          <button type="submit" className="pc-send" disabled={locked || !text.trim()} aria-label="Send">
            <ArrowUp size={18} />
          </button>
        )}
      </div>
      {hero ? null : (
        <p className="pc-composer__hint">Agents only ever see public names from your PC and its model weights.</p>
      )}
    </form>
  );
}

const STARTERS = [
  { title: "My music list", prompt: "Get me my music list for this week", Icon: Headphones },
  { title: "DIY cupboard", prompt: "Help me build a DIY cupboard this weekend", Icon: Hammer },
  { title: "Dinner tonight", prompt: "What should I cook today?", Icon: ChefHat },
  { title: "Movie night", prompt: "Plan a cozy movie night for Friday", Icon: Clapperboard },
];

export function WelcomePanel() {
  const { passport, gate, navigate } = useApp();
  const locked = gate !== "ready";
  const isRunning = useThread((s) => s.isRunning);
  const send = useSend();
  const empty = passport.signals.length === 0;
  return (
    <div className="pc-welcome">
      <BrandMark size={48} />
      <h1>Your personal agent</h1>
      <p className="pc-welcome__lede">
        Music, cooking, DIY or a night in. It knows your taste from your PC and answers with rich cards, not walls of text.
      </p>
      {gate === "blocked" ? (
        <div className="pc-judges pc-judges--center">
          <p>{JUDGES_BANNER}</p>
          <button type="button" className="pc-btn pc-btn--primary pc-btn--pill" onClick={focusQlooCard}>
            <KeyRound size={15} aria-hidden />
            Connect Qloo
          </button>
        </div>
      ) : null}
      {empty && !locked ? (
        <div className="pc-welcome__nudge">
          <span>Your PC is empty, so picks won’t be personal yet.</span>
          <button type="button" onClick={() => navigate("discover")}>
            Open Discover
          </button>
        </div>
      ) : null}
      <ChatComposer hero />
      <div className="pc-starters">
        {STARTERS.map(({ title, prompt, Icon }) => (
          <button
            key={title}
            type="button"
            className="pc-starter"
            aria-disabled={locked || isRunning}
            onClick={() => (locked ? gate === "blocked" && focusQlooCard() : !isRunning && send(prompt))}
          >
            <span className="pc-starter__icon" aria-hidden>
              <Icon size={18} />
            </span>
            <span className="pc-starter__text">
              <strong>{title}</strong>
              <span>{prompt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
