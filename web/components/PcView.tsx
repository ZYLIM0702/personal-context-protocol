"use client";

import { Brain, Download, Fingerprint, Heart, Layers, Plus, RotateCcw, Upload, UserRound, X } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { resetGraph } from "@/lib/api";
import { plural, TYPES, typeMany, typeOne } from "@/lib/format";
import { addSignal, createPassport, encryptPassport, importPassport, isEncrypted, removeSignal, sameName } from "@/lib/pcp";
import { useApp } from "./AppProvider";
import { HowItLearns } from "./HowItLearns";
import { PresetPicker } from "./Presets";
import { Page, Panel } from "./Page";

const WEIGHTS = ["Agent prior", "Qloo taste", "PC graph"];

const SOURCE: Record<string, string> = { seed: "onboarding", accepted: "discover", chat: "chat" };
const sourceOf = (s?: string) => SOURCE[s ?? ""] ?? s ?? "onboarding";

function WeightMeter({ label, value }: { label: string; value: number }) {
  const pct = (Math.max(0, Math.min(5, value)) / 5) * 100;
  return (
    <div className="pc-wmeter">
      <span className="pc-wmeter__label">{label}</span>
      <span className="pc-wmeter__track" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </span>
      <b>{value.toFixed(2)}</b>
    </div>
  );
}

function Backup() {
  const { passport, replacePassport, demo } = useApp();
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const exportPc = async () => {
    if (pass.length < 6) return setMsg({ tone: "err", text: "Use a passphrase of at least 6 characters." });
    setBusy(true);
    try {
      const sealed = await encryptPassport(passport, pass);
      const url = URL.createObjectURL(new Blob([JSON.stringify(sealed, null, 2)], { type: "application/json" }));
      Object.assign(document.createElement("a"), { href: url, download: "personal-context.pcp.json" }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg({ tone: "ok", text: "Encrypted with AES-256-GCM and downloaded." });
      setPass("");
    } finally {
      setBusy(false);
    }
  };

  const importPc = async (text: string, passphrase?: string) => {
    setBusy(true);
    try {
      const next = await importPassport(text, passphrase);
      replacePassport(next);
      setPending(null);
      setPass("");
      setMsg({ tone: "ok", text: `Imported ${plural(next.signals.length, "favorite")}.` });
    } catch (error) {
      setMsg({ tone: "err", text: error instanceof SyntaxError ? "That file isn’t a Personal Context export." : (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    try {
      if (isEncrypted(JSON.parse(text))) {
        setPending(text);
        setMsg({ tone: "ok", text: "This export is encrypted. Enter its passphrase to unlock it." });
        return;
      }
    } catch {
      setMsg({ tone: "err", text: "That file isn’t a Personal Context export." });
      return;
    }
    await importPc(text);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pending) void importPc(pending, pass);
    else void exportPc();
  };

  return (
    <Panel title="Encrypted backup" icon={<Download size={16} />}>
      <p className="pc-muted">
        Exports are sealed with AES-256-GCM using a key from your passphrase (PBKDF2-SHA256, 310k iterations). Only you
        can open the file.
      </p>
      <form className="pc-inputgroup" onSubmit={submit}>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder={pending ? "Passphrase for this export" : "Choose a passphrase"}
          autoComplete="new-password"
          aria-label="Passphrase"
        />
        <button className="pc-inputgroup__primary" disabled={busy}>
          {pending ? <Upload size={15} aria-hidden /> : <Download size={15} aria-hidden />}
          {pending ? "Unlock" : "Export"}
        </button>
      </form>
      <div className="pc-row">
        {pending ? (
          <button type="button" className="pc-textbtn" onClick={() => (setPending(null), setMsg(null))}>
            Cancel import
          </button>
        ) : (
          <button type="button" className="pc-textbtn" disabled={busy} onClick={() => file.current?.click()}>
            <Upload size={14} aria-hidden />
            Import an export
          </button>
        )}
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {msg ? (
        <p className={msg.tone === "ok" ? "pc-note pc-note--ok" : "pc-note pc-note--err"} role="status">
          {msg.text}
        </p>
      ) : null}
      {demo ? <p className="pc-muted">Demo mode: changes stay in this tab.</p> : null}
    </Panel>
  );
}

export function PcView() {
  const { passport, updatePassport, replacePassport, demo, navigate } = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("artist");
  const input = useRef<HTMLInputElement>(null);
  const weights = [0, 1, 2].map((k) => passport.policy.weights[k] ?? 1);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      input.current?.focus();
      return;
    }
    updatePassport((d) => addSignal(d, clean, type, "seed"));
    setName("");
  };

  const resetLearning = () =>
    updatePassport((d) => {
      d.policy.weights = [1, 1, 1];
      d.policy.updates = 0;
    });

  const reset = () => {
    if (!window.confirm("Reset your PC? Favorites, vetoes and learned weights will be cleared on this device.")) return;
    if (!demo) void resetGraph(passport.id).catch(() => undefined);
    replacePassport(createPassport());
  };

  return (
    <Page
      title="Your PC"
      lede="Your Personal Context lives on this device. Agents only see the public names below and the model weights, never your ID or history."
      wide
      actions={
        <button type="button" className="pc-btn pc-btn--soft" onClick={() => navigate("discover")}>
          <Layers size={15} aria-hidden />
          Add in Discover
        </button>
      }
    >
      <div className="pc-grid">
        <div className="pc-stack">
        <Panel title="Favorites" icon={<Heart size={16} />} aside={<span className="pc-count">{passport.signals.length}</span>}>
          {passport.signals.length ? (
            <ul className="pc-chips">
              {[...passport.signals].reverse().map((s) => (
                <li key={s.name} className="pc-chip-lg">
                  <span className="pc-chip-lg__name">{s.name}</span>
                  <span className="pc-chip-lg__meta">{typeOne(s.type)}</span>
                  <span className={`pc-src pc-src--${sourceOf(s.source)}`}>{sourceOf(s.source)}</span>
                  <button type="button" aria-label={`Remove ${s.name}`} onClick={() => updatePassport((d) => removeSignal(d, s.name))}>
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pc-empty">No favorites yet.</p>
          )}
          <form className="pc-inputgroup" onSubmit={add}>
            <input
              ref={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Add an artist, film, book, place…"
              aria-label="Favorite name"
            />
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Category">
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeMany(t)}
                </option>
              ))}
            </select>
            <button className="pc-inputgroup__primary">
              <Plus size={15} aria-hidden />
              Add
            </button>
          </form>
          {passport.signals.length ? (
            <p className="pc-muted">Your 10 most recent favorites are shared with Qloo as public names. Nothing else leaves this device.</p>
          ) : null}
          <div className="pc-subsection">
            <h3>
              Hidden from agents <span className="pc-count pc-count--muted">{passport.vetoes.length}</span>
            </h3>
            {passport.vetoes.length ? (
              <ul className="pc-chips">
                {passport.vetoes.map((v) => (
                  <li key={v.name} className="pc-chip-lg pc-chip-lg--veto">
                    <span className="pc-chip-lg__name">{v.name}</span>
                    <span className={`pc-src pc-src--${v.source ?? "discover"}`}>{v.source ?? "discover"}</span>
                    <button
                      type="button"
                      aria-label={`Allow ${v.name} again`}
                      onClick={() =>
                        updatePassport((d) => {
                          d.vetoes = d.vetoes.filter((x) => !sameName(x.name, v.name));
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pc-muted">Nothing hidden. Skips and “Not for me” land here.</p>
            )}
          </div>
        </Panel>
        <Panel title="Start from a profile" icon={<UserRound size={16} />}>
          <p className="pc-muted">Add a ready-made taste profile, then refine it in Discover.</p>
          <PresetPicker compact />
        </Panel>
        <HowItLearns compact />
        </div>

        <div className="pc-stack">
          <Panel
            title="On-device model"
            icon={<Brain size={16} />}
            aside={
              <button type="button" className="pc-textbtn" onClick={resetLearning}>
                Reset learning
              </button>
            }
          >
            <div className="pc-wmeters">
              {WEIGHTS.map((label, k) => (
                <WeightMeter key={label} label={label} value={weights[k]} />
              ))}
            </div>
            <p className="pc-muted">
              Learned from your swipes · conditional-logit · η = {passport.policy.lr} ·{" "}
              {plural(passport.policy.updates, "update")}
            </p>
          </Panel>
          <Backup />
          <Panel title="Identity" icon={<Fingerprint size={16} />}>
            <p className="pc-muted">
              Pseudonymous ID <code className="pc-code">{passport.id.slice(0, 8)}…</code>, never tied to an account. It
              names your PC graph on the server and is never sent to agents.
            </p>
            <button type="button" className="pc-textbtn pc-textbtn--danger" onClick={reset}>
              <RotateCcw size={14} aria-hidden />
              Reset PC
            </button>
          </Panel>
        </div>

      </div>
    </Page>
  );
}
