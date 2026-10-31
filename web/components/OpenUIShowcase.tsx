"use client";

import { Renderer } from "@openuidev/react-lang";
import { ArrowRight, Boxes, Cpu, FileCode2, LayoutTemplate, Sparkles, Wrench } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { SHOWCASE_PROGRAM } from "@/lib/examples";
import { ProgramView } from "./AssistantAnswer";
import { library, LIBRARY_STATS } from "./library";
import { Page, Panel } from "./Page";

const VERSIONS: [string, string, string][] = [
  ["@openuidev/react-ui", "0.18.1", "AgentInterface chat shell, openuiChatLibrary, theming"],
  ["@openuidev/react-headless", "0.18.1", "Chat store, threads, AG-UI stream adapters"],
  ["@openuidev/react-lang", "1.0.1", "defineComponent, createLibrary, library.prompt(), Renderer"],
  ["@openuidev/lang-core", "1.0.1", "OpenUI Lang parser and prompt generator (pinned override)"],
  ["next", "16.4.2", "Static export served by the PCP server"],
  ["react", "19.3.1", "UI runtime"],
];

const CUSTOM: [string, string][] = [
  ["Playlist", "Ordered tracks with “because you love” notes and a Qloo affinity meter"],
  ["Recipe", "Time, servings, ingredient checklist, method and a taste note from your PC"],
  ["Checklist", "Materials or to-dos with quantities, read-only"],
  ["PickList", "Agent candidates re-ranked on your device (deterministic path)"],
];

function Node({ icon, title, body, accent }: { icon: ReactNode; title: string; body: string; accent?: boolean }) {
  return (
    <div className={accent ? "pc-flow__node pc-flow__node--accent" : "pc-flow__node"}>
      <span className="pc-flow__icon" aria-hidden>
        {icon}
      </span>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function Arrow() {
  return (
    <span className="pc-flow__arrow" aria-hidden>
      <ArrowRight size={18} />
    </span>
  );
}

export function OpenUIShowcase() {
  const stats = useMemo(() => LIBRARY_STATS(), []);
  return (
    <Page
      title="How we use OpenUI"
      lede="The personal agent answers in OpenUI Lang, a compact, streaming-friendly language for generative UI. The model never writes HTML; it composes components we registered, and the Renderer turns them into interactive UI."
      wide
    >
      <section className="pc-flow" aria-label="Generative UI pipeline">
        <Node icon={<Boxes size={18} />} title="Component library" body="openuiChatLibrary + Playlist, Recipe, Checklist, PickList" />
        <Arrow />
        <Node icon={<FileCode2 size={18} />} title="library.prompt()" body={`System prompt from ${stats.promptComponents} components, sent as ui_prompt`} />
        <Arrow />
        <Node icon={<Cpu size={18} />} title="LLM writes OpenUI Lang" body="root = Card([...]) streamed line by line" accent />
        <Arrow />
        <Node icon={<LayoutTemplate size={18} />} title="Renderer" body="Parses, validates against Zod schemas, renders" />
        <Arrow />
        <Node icon={<Sparkles size={18} />} title="Interactive UI" body="Cards, tables, steps, recipes in the chat" />
      </section>
      <div className="pc-flow__tool">
        <Wrench size={15} aria-hidden />
        <span>
          Tool results from PCP feed the LLM: <code className="pc-code">pcp_recommend</code> ranks options with Qloo taste
          and your PC graph, no extra LLM call.
        </span>
      </div>

      <div className="pc-kpis pc-kpis--3">
        <div className="pc-kpi">
          <span className="pc-kpi__label">Components the Renderer knows</span>
          <strong className="pc-kpi__value">{stats.components}</strong>
          <span className="pc-kpi__sub">openuiChatLibrary plus 4 custom</span>
        </div>
        <div className="pc-kpi">
          <span className="pc-kpi__label">Components offered to the LLM</span>
          <strong className="pc-kpi__value">{stats.promptComponents}</strong>
          <span className="pc-kpi__sub">read-only subset, no buttons or forms</span>
        </div>
        <div className="pc-kpi">
          <span className="pc-kpi__label">ui_prompt size</span>
          <strong className="pc-kpi__value">≈{Math.round(stats.promptChars / 4 / 100) / 10}k</strong>
          <span className="pc-kpi__sub">tokens, generated in the browser</span>
        </div>
      </div>

      <div className="pc-grid pc-grid--showcase">
        <Panel title="OpenUI Lang" icon={<FileCode2 size={16} />}>
          <p className="pc-muted">This is the program behind the “What should I cook today?” example.</p>
          <ProgramView program={SHOWCASE_PROGRAM} />
        </Panel>
        <Panel title="Rendered" icon={<LayoutTemplate size={16} />}>
          <p className="pc-muted">The same program, rendered live by the OpenUI Renderer with our library.</p>
          <div className="pc-showcase__render">
            <Renderer response={SHOWCASE_PROGRAM} library={library} />
          </div>
        </Panel>
      </div>

      <div className="pc-grid">
        <Panel title="Our custom components" icon={<Boxes size={16} />}>
          <ul className="pc-deflist">
            {CUSTOM.map(([name, body]) => (
              <li key={name}>
                <code className="pc-code">{name}</code>
                <span>{body}</span>
              </li>
            ))}
          </ul>
          <p className="pc-muted">
            Each is a <code className="pc-code">defineComponent</code> with a Zod schema, added to{" "}
            <code className="pc-code">Card.children</code> with <code className="pc-code">library.extend()</code>.
          </p>
        </Panel>
        <Panel title="Pinned packages" icon={<FileCode2 size={16} />}>
          <ul className="pc-deflist">
            {VERSIONS.map(([name, version, body]) => (
              <li key={name}>
                <code className="pc-code">
                  {name}@{version}
                </code>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Two paths, one Renderer" icon={<Cpu size={16} />} className="pc-span-2">
          <ul className="pc-facts">
            <li>
              Generative: <code className="pc-code">POST /v1/chat</code> sends your messages, the disclosed PC and the
              ui_prompt. The model replies in OpenUI Lang; if a reply doesn’t parse, it is shown as Markdown.
            </li>
            <li>
              Deterministic: older “picks” answers turn a <code className="pc-code">/v1/propose</code> result into a
              PickList program on the client, so Qloo values are never written by a model.
            </li>
            <li>Answers are read-only. Choices and training happen in Discover; chat memory learns silently.</li>
          </ul>
        </Panel>
      </div>
    </Page>
  );
}
