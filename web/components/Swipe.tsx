"use client";

import { Heart, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { typeOne } from "@/lib/format";

export type SwipeFace = { key: string; title: string; type: string; lines?: ReactNode; badge?: ReactNode; meter?: ReactNode };

const THRESHOLD = 110;

function Face({
  face,
  depth,
  drag,
  leaving,
  handlers,
}: {
  face: SwipeFace;
  depth: number;
  drag: { x: number; y: number; active: boolean };
  leaving: "left" | "right" | null;
  handlers: Record<string, (e: PointerEvent<HTMLDivElement>) => void>;
}) {
  const top = depth === 0;
  const x = top ? (leaving ? (leaving === "right" ? 640 : -640) : drag.x) : 0;
  const y = top && !leaving ? drag.y * 0.25 : 0;
  const love = top ? Math.max(0, Math.min(1, x / THRESHOLD)) : 0;
  const skip = top ? Math.max(0, Math.min(1, -x / THRESHOLD)) : 0;
  return (
    <div
      className={`pc-swipe pc-swipe--${face.type}`}
      style={{
        transform: top ? `translate(${x}px, ${y}px) rotate(${x / 20}deg)` : `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`,
        transition: top && drag.active ? "none" : "transform 260ms cubic-bezier(.2,.8,.2,1), opacity 260ms",
        opacity: top && leaving ? 0 : 1,
        zIndex: 10 - depth,
      }}
      aria-hidden={!top}
      {...(top ? handlers : {})}
    >
      <div className="pc-swipe__stamp pc-swipe__stamp--love" style={{ opacity: love }}>
        Love
      </div>
      <div className="pc-swipe__stamp pc-swipe__stamp--skip" style={{ opacity: skip }}>
        Skip
      </div>
      <div className="pc-swipe__art" aria-hidden>
        <span>{face.title.slice(0, 1)}</span>
      </div>
      <div className="pc-swipe__body">
        <div className="pc-swipe__tags">
          <span className="pc-swipe__type">{typeOne(face.type)}</span>
          {face.badge}
        </div>
        <h3>{face.title}</h3>
        {face.lines}
        {face.meter}
      </div>
    </div>
  );
}

export function SwipeDeck({
  faces,
  onDecide,
  onUndo,
  canUndo,
  empty,
  extra,
}: {
  faces: SwipeFace[];
  onDecide: (face: SwipeFace, loved: boolean) => void;
  onUndo: () => void;
  canUndo: boolean;
  empty: ReactNode;
  extra?: ReactNode;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<"left" | "right" | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const current = faces[0];

  const decide = useCallback(
    (loved: boolean) => {
      if (!current || leaving) return;
      setLeaving(loved ? "right" : "left");
      setTimeout(() => {
        onDecide(current, loved);
        setLeaving(null);
        setDrag({ x: 0, y: 0, active: false });
      }, 230);
    },
    [current, leaving, onDecide],
  );

  const undo = useCallback(() => {
    if (!leaving && canUndo) onUndo();
  }, [leaving, canUndo, onUndo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowRight") decide(true);
      else if (e.key === "ArrowLeft") decide(false);
      else if (e.key === "Backspace" || e.key.toLowerCase() === "z") undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, undo]);

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      start.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ x: 0, y: 0, active: true });
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (!start.current) return;
      setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      start.current = null;
      if (dx > THRESHOLD) decide(true);
      else if (dx < -THRESHOLD) decide(false);
      else setDrag({ x: 0, y: 0, active: false });
    },
  };

  const visible = faces.slice(0, 3);

  return (
    <div className="pc-deck">
      <div className="pc-deck__stack">
        {visible.length ? (
          [...visible]
            .reverse()
            .map((face) => {
              const depth = visible.indexOf(face);
              return (
                <Face
                  key={face.key}
                  face={face}
                  depth={depth}
                  drag={drag}
                  leaving={depth === 0 ? leaving : null}
                  handlers={handlers}
                />
              );
            })
        ) : (
          <div className="pc-deck__end">{empty}</div>
        )}
      </div>
      <div className="pc-deck__controls">
        <button type="button" className="pc-round pc-round--sm" onClick={undo} disabled={!canUndo} aria-label="Undo">
          <Undo2 size={18} />
        </button>
        <button type="button" className="pc-round pc-round--skip" onClick={() => decide(false)} disabled={!current} aria-label="Skip">
          <X size={26} />
        </button>
        <button type="button" className="pc-round pc-round--love" onClick={() => decide(true)} disabled={!current} aria-label="Love">
          <Heart size={26} />
        </button>
        {extra}
      </div>
      <p className="pc-deck__keys">Drag the card, or press ← to skip, → to love, Z to undo</p>
    </div>
  );
}
