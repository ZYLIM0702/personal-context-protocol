"use client";

import { useThread, type AssistantMessage } from "@openuidev/react-headless";
import { Renderer, type ActionEvent, type ParseResult } from "@openuidev/react-lang";
import { MarkDownRenderer } from "@openuidev/react-ui";
import { Check, Code2, Copy } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { answerMeta, looksLikeLang } from "@/lib/chat";
import { library } from "./library";

function onAction(event: ActionEvent) {
  if (event.type === "open_url") {
    const url = event.params?.["url"];
    if (typeof url === "string") window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function ProgramView({ program }: { program: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pc-program">
      <div className="pc-program__bar">
        <span>OpenUI Lang</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(program);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{program}</code>
      </pre>
    </div>
  );
}

export function AssistantAnswer({ message }: { message: AssistantMessage }) {
  const messages = useThread((s) => s.messages);
  const isRunning = useThread((s) => s.isRunning);
  const content = typeof message.content === "string" ? message.content : "";
  const lastAssistant = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant")?.id, [messages]);
  const streaming = isRunning && lastAssistant === message.id;
  const meta = answerMeta.get(message.id);
  const lang = looksLikeLang(content);
  const [fallback, setFallback] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const onParse = useCallback(
    (result: ParseResult | null) => {
      if (!streaming && lang && (!result || !result.root)) setFallback(true);
    },
    [streaming, lang],
  );

  return (
    <div className="pc-msg">
      {lang && !fallback ? (
        <Renderer response={content} library={library} isStreaming={streaming} onAction={onAction} onParseResult={onParse} />
      ) : (
        <MarkDownRenderer textMarkdown={content} />
      )}
      {!streaming && meta ? (
        <footer className="pc-msg__foot">
          <span>{meta.label}</span>
          {meta.program && lang ? (
            <button type="button" className="pc-msg__code" aria-expanded={showCode} onClick={() => setShowCode(!showCode)}>
              <Code2 size={13} aria-hidden />
              {showCode ? "Hide OpenUI Lang" : "View OpenUI Lang"}
            </button>
          ) : null}
        </footer>
      ) : null}
      {showCode ? <ProgramView program={content} /> : null}
    </div>
  );
}
