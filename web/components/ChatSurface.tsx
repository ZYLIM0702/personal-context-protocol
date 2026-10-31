"use client";

import { useThreadList } from "@openuidev/react-headless";
import { AgentInterface } from "@openuidev/react-ui";
import { useEffect, useRef, useState } from "react";
import { chatEvents, createLLM, createStorage, emitChat, resolveDemoThread } from "@/lib/chat";
import { theme } from "@/lib/theme";
import { useApp } from "./AppProvider";
import { PcPill } from "./Chrome";
import { ChatComposer, WelcomePanel } from "./Composer";
import { AssistantAnswer } from "./AssistantAnswer";
import { library } from "./library";

function ChatBridge() {
  const { demo, passport } = useApp();
  const selected = useThreadList((s) => s.selectedThreadId);
  const selectThread = useThreadList((s) => s.selectThread);
  const switchToNewThread = useThreadList((s) => s.switchToNewThread);
  const loadThreads = useThreadList((s) => s.loadThreads);
  const booted = useRef(false);

  useEffect(() => {
    loadThreads();
    const onChange = () => loadThreads();
    chatEvents.addEventListener("changed", onChange);
    return () => chatEvents.removeEventListener("changed", onChange);
  }, [loadThreads]);

  useEffect(() => {
    emitChat("selected", selected ?? undefined);
  }, [selected]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string | undefined>).detail;
      if (id) selectThread(id);
    };
    const onNew = () => switchToNewThread();
    chatEvents.addEventListener("open", onOpen);
    chatEvents.addEventListener("new", onNew);
    return () => {
      chatEvents.removeEventListener("open", onOpen);
      chatEvents.removeEventListener("new", onNew);
    };
  }, [selectThread, switchToNewThread]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const wanted = new URLSearchParams(window.location.search).get("chat");
    if (wanted) selectThread(wanted);
    else if (demo) void resolveDemoThread(passport.id).then((id) => selectThread(id));
  }, [demo, passport.id, selectThread]);

  return null;
}

export function ChatSurface() {
  const { runtime } = useApp();
  const [llm] = useState(() => createLLM(runtime));
  const [storage] = useState(() => createStorage(runtime));
  return (
    <div className="pc-chat">
      <AgentInterface
        llm={llm}
        storage={storage}
        componentLibrary={library}
        components={{ AssistantMessage: AssistantAnswer }}
        theme={{ mode: "light", lightTheme: theme }}
        agentName="PCP"
        logoUrl="/brand/mark-128.png"
        scrollVariant="user-message-anchor"
      >
        <AgentInterface.Sidebar>
          <span />
        </AgentInterface.Sidebar>
        <AgentInterface.ThreadHeader end={<PcPill />} />
        <AgentInterface.Welcome>
          <WelcomePanel />
        </AgentInterface.Welcome>
        <AgentInterface.Composer>
          <ChatComposer />
        </AgentInterface.Composer>
        <ChatBridge />
      </AgentInterface>
    </div>
  );
}
