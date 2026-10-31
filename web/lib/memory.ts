import type { MemoryItem } from "./types";

const key = (pcId: string) => `pcp-memory:${pcId}`;
export const memoryEvents = new EventTarget();

export function readMemory(pcId: string): MemoryItem[] {
  try {
    const raw = localStorage.getItem(key(pcId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendMemory(pcId: string, items: MemoryItem[], persist: boolean) {
  const next = [...items, ...readMemory(pcId)].slice(0, 100);
  if (persist) {
    try {
      localStorage.setItem(key(pcId), JSON.stringify(next));
    } catch {
      return;
    }
  }
  memoryEvents.dispatchEvent(new CustomEvent("learned", { detail: items }));
}
