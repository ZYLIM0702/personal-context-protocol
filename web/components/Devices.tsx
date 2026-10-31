"use client";

import { CheckCircle2, Info, Laptop, Lock, QrCode, RefreshCw, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPairing, deviceName, isLocalHost, wasConsumed, type PairingOffer } from "@/lib/pairing";
import { relativeTime } from "@/lib/format";
import { useApp } from "./AppProvider";
import { Page, Panel } from "./Page";

type PairState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; offer: PairingOffer; qr: string }
  | { kind: "paired" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until ? Math.max(0, until - now) : 0;
}

export function PairPhone({ auto = false }: { auto?: boolean }) {
  const { passport, addDevice, demo } = useApp();
  const [state, setState] = useState<PairState>({ kind: "idle" });
  const started = useRef(false);
  const left = useCountdown(state.kind === "ready" ? state.offer.expires : null);

  const start = useCallback(async () => {
    setState({ kind: "creating" });
    try {
      const offer = await createPairing(passport);
      const qr = await QRCode.toDataURL(offer.url, {
        margin: 1,
        width: 440,
        errorCorrectionLevel: "M",
        color: { dark: "#151a2d", light: "#ffffff" },
      });
      setState({ kind: "ready", offer, qr });
    } catch (error) {
      setState({ kind: "error", message: (error as Error).message });
    }
  }, [passport]);

  useEffect(() => {
    if ((auto || demo) && !started.current) {
      started.current = true;
      void start();
    }
  }, [auto, demo, start]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const { vid, expires } = state.offer;
    const id = setInterval(async () => {
      if (Date.now() > expires) {
        setState({ kind: "expired" });
        return;
      }
      if (await wasConsumed(vid)) {
        addDevice({ id: vid, name: "Phone", paired_at: new Date().toISOString() });
        setState({ kind: "paired" });
      }
    }, 3000);
    return () => clearInterval(id);
  }, [state, addDevice]);

  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");

  return (
    <div className="pc-pair">
      <div className="pc-pair__qr">
        {state.kind === "ready" ? (
          <img src={state.qr} alt="QR code to pair your phone" width={220} height={220} />
        ) : state.kind === "paired" ? (
          <div className="pc-pair__done">
            <CheckCircle2 size={40} aria-hidden />
            <strong>Phone paired</strong>
          </div>
        ) : (
          <div className={state.kind === "creating" ? "pc-pair__placeholder pc-skeleton" : "pc-pair__placeholder"}>
            <QrCode size={44} aria-hidden />
          </div>
        )}
      </div>
      <div className="pc-pair__body">
        <ol className="pc-pair__steps">
          <li>Open your phone’s camera and scan the code.</li>
          <li>Your PC is decrypted on the phone with the key inside the code.</li>
          <li>The one-time copy is deleted from the server right after.</li>
        </ol>
        {state.kind === "ready" ? (
          <p className="pc-pair__timer">
            Code expires in {mm}:{ss}
          </p>
        ) : null}
        {state.kind === "expired" ? <p className="pc-note">That code expired. Make a new one.</p> : null}
        {state.kind === "error" ? <p className="pc-note pc-note--err">{state.message}</p> : null}
        <div className="pc-row">
          {state.kind === "ready" ? (
            <button type="button" className="pc-btn pc-btn--pill" onClick={() => void start()}>
              <RefreshCw size={15} aria-hidden />
              New code
            </button>
          ) : (
            <button type="button" className="pc-btn pc-btn--primary pc-btn--pill" disabled={state.kind === "creating"} onClick={() => void start()}>
              <QrCode size={15} aria-hidden />
              {state.kind === "paired" ? "Pair another phone" : "Create pairing code"}
            </button>
          )}
        </div>
        <p className="pc-e2e">
          <Lock size={13} aria-hidden />
          End-to-end encrypted: the server only relays ciphertext; the key travels in the QR code.
        </p>
        {isLocalHost() ? (
          <p className="pc-pair__local">
            <Info size={13} aria-hidden />
            Open this page via your public URL (e.g. your Cloudflare tunnel) so your phone can reach it.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Devices() {
  const { devices, revokeDevice } = useApp();
  const [self] = useState(() => deviceName());
  return (
    <Page title="Devices" lede="Carry your Personal Context to your phone. Pairing is one-time, expires in 10 minutes and never exposes your data to the server." wide>
      <div className="pc-grid pc-grid--devices">
        <Panel title="Pair a phone" icon={<Smartphone size={16} />} className="pc-span-2">
          <PairPhone />
        </Panel>
        <Panel title="Your devices" icon={<Laptop size={16} />} className="pc-span-2">
          <ul className="pc-devices">
            <li>
              <span className="pc-devices__icon" aria-hidden>
                <Laptop size={18} />
              </span>
              <div>
                <strong>This device</strong>
                <span>{self} · holds your PC</span>
              </div>
              <span className="pc-tag pc-tag--violet">Active</span>
            </li>
            {devices.map((d) => (
              <li key={d.id}>
                <span className="pc-devices__icon" aria-hidden>
                  <Smartphone size={18} />
                </span>
                <div>
                  <strong>{d.name}</strong>
                  <span>Paired {relativeTime(d.paired_at)}</span>
                </div>
                <button type="button" className="pc-textbtn pc-textbtn--danger" onClick={() => revokeDevice(d.id)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
          <p className="pc-muted">Revoke removes a device from this list on this browser. The phone keeps its own copy until you reset it there.</p>
        </Panel>
      </div>
    </Page>
  );
}
