"use client";

import {
  BookOpen,
  Boxes,
  ExternalLink,
  Fingerprint,
  Layers,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Plus,
  Settings2,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { readCache } from "@/lib/cache";
import { chatEvents, emitChat, fetchConversations, removeConversation } from "@/lib/chat";
import { EXAMPLES } from "@/lib/examples";
import { plural, relativeTime } from "@/lib/format";
import type { Conversation } from "@/lib/types";
import { useApp, type PageId } from "./AppProvider";
import { QlooCard } from "./QlooCard";

export const DOCS_URL = "https://github.com/ZYLIM0702/personal-context-protocol#readme";

export function BrandMark({ size = 30 }: { size?: number }) {
  return <img className="pc-brand__mark" src="/brand/mark-128.png" alt="" width={size} height={size} />;
}

export function BrandText() {
  return (
    <span className="pc-brand__text">
      <strong>PCP</strong>
      <span>Personal Context Protocol</span>
    </span>
  );
}

export function PcPill() {
  const { passport, demo, navigate } = useApp();
  return (
    <span className="pc-header-pills">
      {demo ? <span className="pc-pill pc-pill--demo">Demo mode</span> : null}
      <button type="button" className="pc-pill" onClick={() => navigate("pc")}>
        <Fingerprint size={14} aria-hidden />
        PC · {plural(passport.signals.length, "signal")}
      </button>
    </span>
  );
}

const NAV: { id: PageId; label: string; icon: ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "discover", label: "Discover", icon: <Layers size={18} /> },
  { id: "ask", label: "Ask", icon: <MessageSquare size={18} /> },
  { id: "pc", label: "Your PC", icon: <Fingerprint size={18} /> },
  { id: "devices", label: "Devices", icon: <Smartphone size={18} /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={18} /> },
];

function useNow(interval = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

function useConversations(pcId: string) {
  const [list, setList] = useState<Conversation[]>(() => readCache(pcId).list);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setList(await fetchConversations(pcId));
    } catch {
      setList(readCache(pcId).list);
    } finally {
      setLoading(false);
    }
  }, [pcId]);
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    chatEvents.addEventListener("changed", onChange);
    return () => chatEvents.removeEventListener("changed", onChange);
  }, [refresh]);
  return { list, loading };
}

function Recent() {
  const { passport, page, navigate } = useApp();
  const { list, loading } = useConversations(passport.id);
  const [active, setActive] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    const onSelect = (e: Event) => setActive((e as CustomEvent<string | undefined>).detail ?? null);
    chatEvents.addEventListener("selected", onSelect);
    return () => chatEvents.removeEventListener("selected", onSelect);
  }, []);

  const ordered = [...list].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

  const exampleRow = (id: string, title: string) => {
    const on = id === active && page === "ask";
    return (
      <li key={id} className={on ? "pc-conv pc-conv--active" : "pc-conv"}>
        <button
          type="button"
          className="pc-conv__open"
          aria-current={on ? "page" : undefined}
          onClick={() => {
            navigate("ask");
            emitChat("open", id);
          }}
        >
          <span className="pc-conv__title">{title}</span>
          <span className="pc-conv__time">Example · read-only</span>
        </button>
      </li>
    );
  };

  return (
    <div className="pc-recent">
      <div className="pc-side-label">Examples</div>
      <ul className="pc-recent__list pc-recent__list--examples">{EXAMPLES.map((e) => exampleRow(e.id, e.title))}</ul>
      <div className="pc-side-label pc-side-label--gap">Recent</div>
      {ordered.length ? (
        <ul className="pc-recent__list">
          {ordered.map((c) => {
            const on = c.id === active && page === "ask";
            return (
              <li key={c.id} className={on ? "pc-conv pc-conv--active" : "pc-conv"}>
                <button
                  type="button"
                  className="pc-conv__open"
                  aria-current={on ? "page" : undefined}
                  onClick={() => {
                    navigate("ask");
                    emitChat("open", c.id);
                  }}
                >
                  <span className="pc-conv__title">{c.title}</span>
                  <span className="pc-conv__time">
                    {c.demo ? "Sample · read-only" : relativeTime(c.updated_at, now)}
                  </span>
                </button>
                {c.demo ? null : (
                  <button
                    type="button"
                    className="pc-conv__delete"
                    aria-label={`Delete “${c.title}”`}
                    title="Delete chat"
                    onClick={() => {
                      if (c.id === active) emitChat("new");
                      void removeConversation(passport.id, c.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pc-recent__empty">{loading ? "Loading…" : "No chats yet. Ask something to start."}</p>
      )}
      <p className="pc-recent__caption">Chats cached in this browser · demo sync in local SQLite</p>
    </div>
  );
}

export function Sidebar() {
  const { page, navigate, drawerOpen, setDrawerOpen } = useApp();
  return (
    <>
      <aside className={drawerOpen ? "pc-sidebar pc-sidebar--open" : "pc-sidebar"} aria-label="Main">
        <div className="pc-sidebar__brand">
          <BrandMark size={32} />
          <BrandText />
          <button type="button" className="pc-iconbtn pc-sidebar__close" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <button
          type="button"
          className="pc-newchat"
          onClick={() => {
            navigate("ask");
            emitChat("new");
          }}
        >
          <Plus size={18} aria-hidden />
          New chat
        </button>
        <nav className="pc-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? "pc-nav__item pc-nav__item--on" : "pc-nav__item"}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <Recent />
        <div className="pc-sidebar__bottom">
          <QlooCard />
          <div className="pc-docs-row">
            <a className="pc-docs" href={DOCS_URL} target="_blank" rel="noreferrer">
              <BookOpen size={15} aria-hidden />
              Docs
              <ExternalLink size={12} aria-hidden />
            </a>
            <button
              type="button"
              className={page === "openui" ? "pc-docs pc-docs--on" : "pc-docs"}
              aria-current={page === "openui" ? "page" : undefined}
              onClick={() => navigate("openui")}
            >
              <Boxes size={15} aria-hidden />
              How we use OpenUI
            </button>
          </div>
        </div>
      </aside>
      <div className={drawerOpen ? "pc-scrim pc-scrim--on" : "pc-scrim"} onClick={() => setDrawerOpen(false)} aria-hidden />
    </>
  );
}

export function TopBar() {
  const { setDrawerOpen } = useApp();
  return (
    <header className="pc-topbar">
      <button type="button" className="pc-iconbtn" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
        <Menu size={20} />
      </button>
      <BrandMark size={26} />
      <strong className="pc-topbar__name">PCP</strong>
      <span className="pc-grow" />
      <PcPill />
    </header>
  );
}

export function PageHeader({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="pc-page__head">
      <div>
        <h1>{title}</h1>
        {lede ? <p>{lede}</p> : null}
      </div>
      {actions ? <div className="pc-page__actions">{actions}</div> : null}
    </header>
  );
}
