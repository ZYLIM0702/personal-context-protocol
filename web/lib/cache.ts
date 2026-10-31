import type { Conversation, Turn } from "./types";

type ChatCache = { list: Conversation[]; turns: Record<string, Turn[]> };

const key = (pcId: string) => `pcp-chats:${pcId}`;
const EMPTY: ChatCache = { list: [], turns: {} };

export function readCache(pcId: string): ChatCache {
  try {
    const raw = localStorage.getItem(key(pcId));
    const parsed = raw ? (JSON.parse(raw) as ChatCache) : null;
    return parsed && Array.isArray(parsed.list) ? { list: parsed.list, turns: parsed.turns ?? {} } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeCache(pcId: string, cache: ChatCache) {
  try {
    localStorage.setItem(key(pcId), JSON.stringify(cache));
  } catch {
    return;
  }
}

export function cacheList(pcId: string, list: Conversation[]) {
  const cache = readCache(pcId);
  const ids = new Set(list.map((c) => c.id));
  const localOnly = cache.list.filter((c) => !ids.has(c.id) && c.id.startsWith("local-"));
  writeCache(pcId, { ...cache, list: [...localOnly, ...list] });
  return [...localOnly, ...list];
}

export function cacheConversation(pcId: string, conversation: Conversation, turns?: Turn[]) {
  const cache = readCache(pcId);
  const list = [conversation, ...cache.list.filter((c) => c.id !== conversation.id)];
  writeCache(pcId, { list, turns: turns ? { ...cache.turns, [conversation.id]: turns } : cache.turns });
}

export function cacheTurns(pcId: string, id: string, turns: Turn[]) {
  const cache = readCache(pcId);
  const at = new Date().toISOString();
  const list = cache.list.map((c) => (c.id === id ? { ...c, updated_at: at } : c));
  writeCache(pcId, { list, turns: { ...cache.turns, [id]: turns } });
}

export function uncache(pcId: string, id: string) {
  const cache = readCache(pcId);
  const turns = { ...cache.turns };
  delete turns[id];
  writeCache(pcId, { list: cache.list.filter((c) => c.id !== id), turns });
}

export function cachedTurns(pcId: string, id: string): Turn[] | null {
  return readCache(pcId).turns[id] ?? null;
}
