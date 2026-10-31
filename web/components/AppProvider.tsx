"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getStatus, graphSignals } from "@/lib/api";
import { demoPassport, readDemo, type DemoConfig } from "@/lib/demo";
import { appendMemory } from "@/lib/memory";
import { addSignal, clonePassport, createPassport, disclose, feedback, load, sameName, save, type Candidate, type Passport } from "@/lib/pcp";
import type { AgentSettings, MemoryItem, ServerStatus } from "@/lib/types";

const SETTINGS_KEY = "pcp-web-agent";
const ONBOARDED_KEY = "pcp-onboarded";
const DEVICES_KEY = "pcp-devices";
const DEFAULT_SETTINGS: AgentSettings = { provider: "default", model: "", baseUrl: "", memory: true };

export const PAGES = ["dashboard", "discover", "ask", "pc", "devices", "settings", "openui"] as const;
export type PageId = (typeof PAGES)[number];

export type Runtime = {
  passport: Passport;
  settings: AgentSettings;
  qlooKey: string;
  demo: DemoConfig | null;
  pendingType: string | null;
  learn?: (items: Omit<MemoryItem, "at">[], candidates: Candidate[]) => void;
};

type StatusState = { state: "checking" } | { state: "ok"; value: ServerStatus } | { state: "error" };

export type Gate = "ready" | "checking" | "blocked" | "error";

export type Device = { id: string; name: string; paired_at: string };

export type Pairing = { vid: string; secret: string };

type AppValue = {
  passport: Passport;
  updatePassport: (mutate: (draft: Passport) => void) => void;
  replacePassport: (next: Passport) => void;
  settings: AgentSettings;
  setSettings: (next: AgentSettings) => void;
  status: StatusState;
  refreshStatus: () => void;
  qlooKey: string;
  setQlooKey: (key: string) => void;
  demo: DemoConfig | null;
  runtime: React.RefObject<Runtime>;
  qlooReady: boolean;
  gate: Gate;
  page: PageId;
  navigate: (page: PageId) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  onboarding: number | null;
  finishOnboarding: () => void;
  pairing: Pairing | null;
  endPairing: () => void;
  devices: Device[];
  addDevice: (device: Device) => void;
  revokeDevice: (id: string) => void;
  resetEverything: () => void;
};

const AppContext = createContext<AppValue | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function readDevices(): Device[] {
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readPairing(): Pairing | null {
  const match = window.location.hash.match(/^#pair=([0-9a-f-]{36})\.([A-Za-z0-9_-]{16,})$/i);
  return match ? { vid: match[1], secret: match[2] } : null;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = readDemo(window.location.search);
    const stored = demo ? null : load();
    const passport = demo ? demoPassport(demo) : (stored ?? createPassport());
    const onboarded = Boolean(readJson<{ at?: string }>(ONBOARDED_KEY, {}).at);
    const forced = Number(params.get("onboard"));
    const skip = params.get("onboard") === "skip";
    const needs = !demo && !skip && (!stored || (!onboarded && stored.signals.length < 3));
    const onboarding = forced >= 1 && forced <= 6 ? forced : needs ? 1 : null;
    const view = params.get("view") as PageId | null;
    const page: PageId = view && PAGES.includes(view) ? view : "dashboard";
    return {
      demo,
      passport,
      onboarding,
      page,
      settings: demo ? DEFAULT_SETTINGS : readJson(SETTINGS_KEY, DEFAULT_SETTINGS),
      pairing: readPairing(),
    };
  });
  const [passport, setPassport] = useState<Passport>(boot.passport);
  const [settings, setSettingsState] = useState<AgentSettings>(boot.settings);
  const [qlooKey, setQlooKey] = useState("");
  const [status, setStatus] = useState<StatusState>({ state: "checking" });
  const [page, setPage] = useState<PageId>(boot.page);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<number | null>(boot.onboarding);
  const [pairing, setPairing] = useState<Pairing | null>(boot.pairing);
  const [devices, setDevices] = useState<Device[]>(() => (boot.demo ? [] : readDevices()));

  const runtime = useRef<Runtime>({ passport, settings, qlooKey, demo: boot.demo, pendingType: null });
  runtime.current.passport = passport;
  runtime.current.settings = settings;
  runtime.current.qlooKey = qlooKey;

  const replacePassport = useCallback(
    (next: Passport) => {
      runtime.current.passport = next;
      setPassport(next);
      if (!boot.demo) save(next);
    },
    [boot.demo],
  );

  const updatePassport = useCallback(
    (mutate: (draft: Passport) => void) => {
      const draft = clonePassport(runtime.current.passport);
      mutate(draft);
      replacePassport(draft);
    },
    [replacePassport],
  );

  runtime.current.learn = (items, candidates) => {
    const at = new Date().toISOString();
    updatePassport((d) => {
      for (const m of items) {
        if (!m?.name || !m.type) continue;
        if (m.liked) {
          if (m.source === "follow-up" && candidates.some((c) => sameName(c.name, m.name))) feedback(d, candidates, m.name, true, m.type);
          addSignal(d, m.name, m.type, "chat");
        } else {
          d.signals = d.signals.filter((s) => !sameName(s.name, m.name));
          if (!d.vetoes.some((v) => sameName(v.name, m.name))) d.vetoes.push({ name: m.name, type: m.type, at, source: "chat" });
        }
      }
    });
    appendMemory(runtime.current.passport.id, items.map((m) => ({ ...m, at })), !boot.demo);
  };

  const setSettings = useCallback(
    (next: AgentSettings) => {
      setSettingsState(next);
      if (!boot.demo) writeJson(SETTINGS_KEY, next);
    },
    [boot.demo],
  );

  const refreshStatus = useCallback(() => {
    getStatus()
      .then((value) => setStatus({ state: "ok", value }))
      .catch(() => setStatus({ state: "error" }));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const shared = useMemo(() => {
    const { signals, vetoes } = disclose(passport);
    return JSON.stringify({ pc_id: passport.id, signals, vetoes });
  }, [passport]);

  useEffect(() => {
    if (boot.demo) return;
    const timer = setTimeout(() => void graphSignals(JSON.parse(shared)).catch(() => undefined), 800);
    return () => clearTimeout(timer);
  }, [shared, boot.demo]);

  const navigate = useCallback((next: PageId) => {
    setPage(next);
    setDrawerOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("view")) navigate(boot.page);
  }, [boot.page, navigate]);

  const finishOnboarding = useCallback(() => {
    if (!boot.demo) {
      writeJson(ONBOARDED_KEY, { at: new Date().toISOString() });
      save(runtime.current.passport);
    }
    setOnboarding(null);
    navigate("dashboard");
  }, [boot.demo, navigate]);

  const endPairing = useCallback(() => {
    setPairing(null);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const addDevice = useCallback(
    (device: Device) =>
      setDevices((list) => {
        const next = [device, ...list.filter((d) => d.id !== device.id)];
        if (!boot.demo) writeJson(DEVICES_KEY, next);
        return next;
      }),
    [boot.demo],
  );

  const revokeDevice = useCallback(
    (id: string) =>
      setDevices((list) => {
        const next = list.filter((d) => d.id !== id);
        if (!boot.demo) writeJson(DEVICES_KEY, next);
        return next;
      }),
    [boot.demo],
  );

  const resetEverything = useCallback(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("pcp-"));
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      return;
    }
    window.location.href = window.location.pathname;
  }, []);

  const qlooReady = status.state === "ok" && status.value.qloo_ready;
  const gate: Gate =
    boot.demo || qlooReady || qlooKey
      ? "ready"
      : status.state === "checking"
        ? "checking"
        : status.state === "error"
          ? "error"
          : "blocked";

  const value = useMemo<AppValue>(
    () => ({
      passport,
      updatePassport,
      replacePassport,
      settings,
      setSettings,
      status,
      refreshStatus,
      qlooKey,
      setQlooKey,
      demo: boot.demo,
      runtime,
      qlooReady,
      gate,
      page,
      navigate,
      drawerOpen,
      setDrawerOpen,
      onboarding,
      finishOnboarding,
      pairing,
      endPairing,
      devices,
      addDevice,
      revokeDevice,
      resetEverything,
    }),
    [
      passport,
      updatePassport,
      replacePassport,
      settings,
      setSettings,
      status,
      refreshStatus,
      qlooKey,
      boot.demo,
      qlooReady,
      gate,
      page,
      navigate,
      drawerOpen,
      onboarding,
      finishOnboarding,
      pairing,
      endPairing,
      devices,
      addDevice,
      revokeDevice,
      resetEverything,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
