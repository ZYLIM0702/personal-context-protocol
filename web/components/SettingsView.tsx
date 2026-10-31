"use client";

import { SwitchItem } from "@openuidev/react-ui";
import { Bot, Brain, KeyRound, RotateCcw, Server, Sparkles } from "lucide-react";
import { PROVIDERS } from "@/lib/format";
import type { ProviderChoice } from "@/lib/types";
import { useApp } from "./AppProvider";
import { Page, Panel } from "./Page";
import { focusQlooCard, JUDGES_BANNER } from "./QlooCard";

function ProviderStatus({ provider }: { provider: ProviderChoice }) {
  const { status } = useApp();
  if (status.state !== "ok") return <p className="pc-status">{status.state === "checking" ? "Checking server…" : "Server unreachable"}</p>;
  const s = status.value;
  if (provider === "default")
    return (
      <p className={s.llm_ready ? "pc-status pc-status--on" : "pc-status"}>
        <span className="pc-dot" aria-hidden />
        {s.llm_ready ? `Server default: ${s.default_provider} · ${s.model}` : "No model key configured on the server"}
      </p>
    );
  const ready = s.providers?.[provider];
  const text =
    provider === "ollama"
      ? "No key needed. Start Ollama or LM Studio on your machine."
      : ready
        ? "Key configured on the server"
        : "Add this provider’s key to the server’s .env";
  return (
    <p className={ready ? "pc-status pc-status--on" : "pc-status"}>
      <span className="pc-dot" aria-hidden />
      {text}
    </p>
  );
}

export function SettingsView() {
  const { settings, setSettings, status, demo, qlooKey, qlooReady, resetEverything } = useApp();
  const meta = settings.provider === "default" ? null : PROVIDERS[settings.provider];

  const reonboard = () => {
    if (window.confirm("Reset everything on this browser and start onboarding again? Your PC, chats cache and settings here will be cleared.")) resetEverything();
  };

  return (
    <Page title="Settings" lede="Choose which agent proposes options and how taste intelligence is connected.">
      <div className="pc-stack">
        <Panel title="Agent" icon={<Bot size={16} />}>
          <div className="pc-fields">
            <label className="pc-field">
              <span>Provider</span>
              <select
                className="pc-select"
                value={settings.provider}
                onChange={(e) => setSettings({ ...settings, provider: e.target.value as ProviderChoice })}
              >
                <option value="default">Server default</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI-compatible API</option>
                <option value="ollama">Local model (Ollama / LM Studio)</option>
              </select>
            </label>
            {meta ? (
              <label className="pc-field">
                <span>Model</span>
                <input
                  className="pc-input"
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  placeholder={meta.model}
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            ) : null}
            {meta?.baseUrl ? (
              <label className="pc-field">
                <span>Base URL</span>
                <input
                  className="pc-input"
                  value={settings.baseUrl}
                  onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                  placeholder={meta.baseUrl}
                  spellCheck={false}
                  autoComplete="off"
                  inputMode="url"
                />
              </label>
            ) : null}
          </div>
          <ProviderStatus provider={settings.provider} />
          <p className="pc-muted">Provider keys stay on the server. A custom base URL is used only for localhost unless the server allows it.</p>
        </Panel>

        <Panel title="Taste intelligence" icon={<Sparkles size={16} />}>
          <p className={qlooReady || qlooKey ? "pc-status pc-status--on" : "pc-status"}>
            <span className="pc-dot" aria-hidden />
            {status.state === "checking"
              ? "Checking Qloo…"
              : status.state === "error"
                ? "Server unreachable"
                : qlooReady
                  ? "Qloo is connected on this server"
                  : qlooKey
                    ? "Connected with your key for this tab"
                    : "Qloo is not connected on this server"}
          </p>
          <p className="pc-muted">
            Qloo scores each candidate against the public names in your PC with <code className="pc-code">qloo_rank</code>,
            through the official <code className="pc-code">qloo mcp</code> server.
          </p>
          {status.state === "ok" && !qlooReady && !qlooKey ? (
            <div className="pc-judges">
              <p>{JUDGES_BANNER}</p>
              <button type="button" className="pc-btn pc-btn--soft" onClick={focusQlooCard}>
                <KeyRound size={15} aria-hidden />
                Connect in the sidebar
              </button>
            </div>
          ) : null}
          {demo ? <p className="pc-note">Demo mode shows simulated values clearly labeled as such.</p> : null}
        </Panel>

        <Panel title="Memory" icon={<Brain size={16} />}>
          <SwitchItem
            label="Learn from my chats"
            description="When you mention something you love or can’t stand, your PC updates quietly. No LLM tokens: a phrase extractor plus Qloo entity matching."
            checked={settings.memory !== false}
            onChange={(on) => setSettings({ ...settings, memory: on })}
          />
          <p className="pc-muted">See what was learned on the Dashboard under “Learned from chat”.</p>
        </Panel>

        <Panel title="Privacy and data" icon={<Server size={16} />}>
          <ul className="pc-facts">
            <li>Requests carry only public entity names from your PC and its model weights.</li>
            <li>Your PC, settings and a chat cache live in this browser. Exports and phone pairing are end-to-end encrypted.</li>
            <li>Chat history syncs to the server’s local SQLite file, scoped to this browser’s PC id.</li>
          </ul>
          <button type="button" className="pc-textbtn pc-textbtn--danger" onClick={reonboard}>
            <RotateCcw size={14} aria-hidden />
            Reset and re-onboard
          </button>
        </Panel>
      </div>
    </Page>
  );
}
