"use client";

import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { receivePairing } from "@/lib/pairing";
import { plural } from "@/lib/format";
import { AppProvider, useApp } from "./AppProvider";
import { ChatSurface } from "./ChatSurface";
import { BrandMark, Sidebar, TopBar } from "./Chrome";
import { Dashboard } from "./Dashboard";
import { Devices } from "./Devices";
import { Discover } from "./Discover";
import { Onboarding } from "./Onboarding";
import { OpenUIShowcase } from "./OpenUIShowcase";
import { PcView } from "./PcView";
import { FOCUS_EVENT } from "./QlooCard";
import { SettingsView } from "./SettingsView";

function PairReceive() {
  const { pairing, endPairing, replacePassport, finishOnboarding } = useApp();
  const [state, setState] = useState<{ kind: "working" } | { kind: "done"; count: number } | { kind: "error"; message: string }>({
    kind: "working",
  });
  const ran = useRef(false);
  useEffect(() => {
    if (!pairing || ran.current) return;
    ran.current = true;
    receivePairing(pairing.vid, pairing.secret)
      .then((p) => {
        replacePassport(p);
        setState({ kind: "done", count: p.signals.length });
      })
      .catch((error: Error) => setState({ kind: "error", message: error.message }));
  }, [pairing, replacePassport]);
  return (
    <div className="pc-onboard">
      <main className="pc-onboard__main">
        <div className="pc-onboard__card">
          <section className="pc-ostep">
            <BrandMark size={56} />
            {state.kind === "working" ? (
              <>
                <Loader2 size={28} className="pc-spin pc-violet" aria-hidden />
                <h1>Pairing this phone…</h1>
                <p className="pc-ostep__lede">Fetching the encrypted copy and decrypting it here with the key from the QR code.</p>
              </>
            ) : state.kind === "done" ? (
              <>
                <CheckCircle2 size={32} className="pc-ok" aria-hidden />
                <h1>Phone paired</h1>
                <p className="pc-ostep__lede">
                  Your PC is on this phone with {plural(state.count, "love")}. The one-time copy was deleted from the server.
                </p>
                <button
                  type="button"
                  className="pc-btn pc-btn--primary pc-btn--pill pc-btn--lg"
                  onClick={() => {
                    endPairing();
                    finishOnboarding();
                  }}
                >
                  Open dashboard
                </button>
              </>
            ) : (
              <>
                <TriangleAlert size={30} className="pc-warn" aria-hidden />
                <h1>Couldn’t pair</h1>
                <p className="pc-ostep__lede">{state.message}</p>
                <button type="button" className="pc-btn pc-btn--pill" onClick={endPairing}>
                  Continue without pairing
                </button>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Workspace() {
  const { page, setDrawerOpen, gate, demo } = useApp();
  const autoOpened = useRef(false);

  useEffect(() => {
    const onFocus = () => {
      if (window.innerWidth < 1024) setDrawerOpen(true);
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_EVENT, onFocus);
  }, [setDrawerOpen]);

  useEffect(() => {
    if (autoOpened.current || demo || gate !== "blocked" || page !== "ask") return;
    if (window.innerWidth >= 1024) return;
    autoOpened.current = true;
    setTimeout(() => window.dispatchEvent(new Event(FOCUS_EVENT)), 300);
  }, [gate, page, demo]);

  return (
    <div className="pc-shell">
      <Sidebar />
      <div className="pc-main">
        <TopBar />
        <div className="pc-view" hidden={page !== "ask"}>
          <ChatSurface />
        </div>
        {page === "dashboard" ? <Dashboard /> : null}
        {page === "discover" ? <Discover /> : null}
        {page === "pc" ? <PcView /> : null}
        {page === "devices" ? <Devices /> : null}
        {page === "settings" ? <SettingsView /> : null}
        {page === "openui" ? <OpenUIShowcase /> : null}
      </div>
    </div>
  );
}

function Root() {
  const { pairing, onboarding } = useApp();
  if (pairing) return <PairReceive />;
  if (onboarding) return <Onboarding />;
  return <Workspace />;
}

export default function Shell() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
