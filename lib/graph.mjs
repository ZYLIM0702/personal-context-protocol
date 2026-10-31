export const USER = "user";
export const GRAPH_TYPES = ["artist", "book", "brand", "movie", "person", "place", "podcast", "tv_show"];

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nodeId = (type, name) => `${type || "entity"}:${norm(name)}`;
const tokenize = (text) => norm(text).split(" ").filter((t) => t.length > 1);

const SEED_VOCABULARY = {
  movie: "movie movies film films watch watching cinema tonight netflix thriller comedy horror director actor screen friday night blockbuster",
  tv_show: "show shows series tv episode episodes binge season sitcom drama streaming watch",
  artist: "music song songs artist artists band bands listen listening playlist album drive road concert singer rap rock jazz pop vibe",
  book: "book books read reading novel novels author fiction nonfiction memoir library kindle cozy rainy weekend",
  podcast: "podcast podcasts episode commute listen interview audio talk",
  place: "place places eat restaurant restaurants cafe coffee bar dinner lunch brunch visit travel trip city spot food date",
  brand: "brand brands wear clothes clothing fashion shoes buy shop shopping style gift jacket bag outfit",
};
const SEED_WEIGHT = 3;

export function createGraph(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pc_nodes (pc TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, type TEXT, PRIMARY KEY (pc, id));
    CREATE TABLE IF NOT EXISTS pc_edges (pc TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, kind TEXT NOT NULL, w REAL NOT NULL, PRIMARY KEY (pc, a, b, kind));
    CREATE TABLE IF NOT EXISTS pc_type_tokens (pc TEXT NOT NULL, token TEXT NOT NULL, type TEXT NOT NULL, n REAL NOT NULL, PRIMARY KEY (pc, token, type));
  `);

  const upsertNode = db.prepare(
    "INSERT INTO pc_nodes (pc, id, name, type) VALUES (?, ?, ?, ?) ON CONFLICT(pc, id) DO UPDATE SET name = excluded.name, type = COALESCE(excluded.type, pc_nodes.type)",
  );
  const addEdge = db.prepare(
    "INSERT INTO pc_edges (pc, a, b, kind, w) VALUES (?, ?, ?, ?, ?) ON CONFLICT(pc, a, b, kind) DO UPDATE SET w = MIN(10, pc_edges.w + excluded.w)",
  );
  const setEdge = db.prepare(
    "INSERT INTO pc_edges (pc, a, b, kind, w) VALUES (?, ?, ?, ?, ?) ON CONFLICT(pc, a, b, kind) DO UPDATE SET w = excluded.w",
  );
  const dropEdge = db.prepare("DELETE FROM pc_edges WHERE pc = ? AND a = ? AND b = ? AND kind = ?");
  const edgesOf = db.prepare("SELECT a, b, kind, w FROM pc_edges WHERE pc = ?");
  const nodesOf = db.prepare("SELECT id, name, type FROM pc_nodes WHERE pc = ?");
  const learnToken = db.prepare(
    "INSERT INTO pc_type_tokens (pc, token, type, n) VALUES (?, ?, ?, 1) ON CONFLICT(pc, token, type) DO UPDATE SET n = n + 1",
  );
  const tokensOf = db.prepare("SELECT token, type, n FROM pc_type_tokens WHERE pc = ?");

  const node = (pc, name, type) => {
    const id = nodeId(type, name);
    upsertNode.run(pc, id, String(name).trim(), type ?? null);
    return id;
  };

  const transaction = (fn) => {
    db.exec("BEGIN");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  function stats(pc) {
    const nodes = db.prepare("SELECT COUNT(*) AS n FROM pc_nodes WHERE pc = ?").get(pc).n;
    const edges = db.prepare("SELECT COUNT(*) AS n FROM pc_edges WHERE pc = ?").get(pc).n;
    return { nodes, edges };
  }

  function syncSignals(pc, signals = [], vetoes = []) {
    return transaction(() => {
      upsertNode.run(pc, USER, "You", null);
      const loved = new Set(signals.filter((s) => s?.name).map((s) => node(pc, s.name, s.type)));
      for (const row of edgesOf.all(pc)) {
        if (row.a === USER && row.kind === "love" && !loved.has(row.b)) dropEdge.run(pc, USER, row.b, "love");
      }
      for (const id of loved) setEdge.run(pc, USER, id, "love", 1);
      const typeByName = new Map(signals.map((s) => [norm(s.name), s.type]));
      for (const v of vetoes) {
        if (!v?.name) continue;
        const id = node(pc, v.name, v.type ?? typeByName.get(norm(v.name)));
        dropEdge.run(pc, USER, id, "love");
        setEdge.run(pc, USER, id, "veto", 1);
      }
      return stats(pc);
    });
  }

  function linkQloo(pc, type, candidates = [], signals = []) {
    const scored = candidates.filter((c) => typeof c.qloo === "number" && c.qloo_kind !== "rank");
    if (!scored.length || !signals.length) return;
    transaction(() => {
      const sources = signals.filter((s) => s?.name).map((s) => node(pc, s.name, s.type));
      for (const c of scored) {
        const target = node(pc, c.name, type);
        for (const source of sources) if (source !== target) setEdge.run(pc, source, target, "qloo", c.qloo / sources.length);
      }
    });
  }

  function feedback(pc, { task, type, name, liked, shown = [] }) {
    if (!name) return stats(pc);
    return transaction(() => {
      upsertNode.run(pc, USER, "You", null);
      const item = node(pc, name, type);
      if (liked) {
        addEdge.run(pc, USER, item, "like", 1);
        dropEdge.run(pc, USER, item, "veto");
        const likedIds = new Set(edgesOf.all(pc).filter((e) => e.a === USER && (e.kind === "like" || e.kind === "love")).map((e) => e.b));
        for (const other of shown) {
          const id = nodeId(type, other);
          if (id !== item && likedIds.has(id)) addEdge.run(pc, item, id, "co", 0.5);
        }
        if (task && GRAPH_TYPES.includes(type)) for (const token of tokenize(task)) learnToken.run(pc, token, type);
      } else {
        addEdge.run(pc, USER, item, "veto", 1);
      }
      return stats(pc);
    });
  }

  function pageRank(pc, { alpha = 0.15, iterations = 40 } = {}) {
    const adjacency = new Map();
    const link = (a, b, w) => {
      if (!adjacency.has(a)) adjacency.set(a, new Map());
      adjacency.get(a).set(b, (adjacency.get(a).get(b) ?? 0) + w);
    };
    for (const { a, b, kind, w } of edgesOf.all(pc)) {
      if (kind === "veto" || w <= 0) continue;
      link(a, b, w);
      link(b, a, w);
    }
    if (!adjacency.has(USER)) return new Map();
    let rank = new Map([[USER, 1]]);
    for (let i = 0; i < iterations; i++) {
      const next = new Map([[USER, alpha]]);
      for (const [u, score] of rank) {
        const neighbors = adjacency.get(u);
        if (!neighbors) {
          next.set(USER, next.get(USER) + (1 - alpha) * score);
          continue;
        }
        const total = [...neighbors.values()].reduce((s, w) => s + w, 0);
        for (const [v, w] of neighbors) next.set(v, (next.get(v) ?? 0) + (1 - alpha) * score * (w / total));
      }
      rank = next;
    }
    return rank;
  }

  function vetoed(pc) {
    return new Set(edgesOf.all(pc).filter((e) => e.a === USER && e.kind === "veto").map((e) => e.b));
  }

  function scores(pc, type, names) {
    const rank = pageRank(pc);
    const blocked = vetoed(pc);
    const max = Math.max(0, ...[...rank].filter(([id]) => id !== USER).map(([, v]) => v)) || 1;
    return names.map((name) => {
      const id = nodeId(type, name);
      if (blocked.has(id)) return -1;
      return rank.has(id) ? rank.get(id) / max : 0;
    });
  }

  function suggest(pc, type, limit = 10) {
    const rank = pageRank(pc);
    const blocked = vetoed(pc);
    const own = new Set(edgesOf.all(pc).filter((e) => e.a === USER && e.kind !== "veto").map((e) => e.b));
    const names = new Map(nodesOf.all(pc).map((n) => [n.id, n]));
    return [...rank]
      .filter(([id]) => id !== USER && !blocked.has(id) && !own.has(id) && names.get(id)?.type === type)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ name: names.get(id).name, score }));
  }

  function because(pc, type, names) {
    const all = edgesOf.all(pc);
    const loved = new Set(all.filter((e) => e.a === USER && (e.kind === "love" || e.kind === "like")).map((e) => e.b));
    const label = new Map(nodesOf.all(pc).map((n) => [n.id, n.name]));
    return names.map((name) => {
      const id = nodeId(type, name);
      const best = all
        .filter((e) => (e.kind === "qloo" || e.kind === "co") && ((e.b === id && loved.has(e.a)) || (e.a === id && loved.has(e.b))))
        .sort((x, y) => y.w - x.w)[0];
      if (!best) return null;
      return label.get(best.a === id ? best.b : best.a) ?? null;
    });
  }

  function lovedTypes(pc) {
    const types = new Map();
    for (const n of nodesOf.all(pc)) if (n.type) types.set(n.type, 0);
    for (const e of edgesOf.all(pc)) {
      if (e.a !== USER || !(e.kind === "love" || e.kind === "like")) continue;
      const t = e.b.split(":")[0];
      types.set(t, (types.get(t) ?? 0) + e.w);
    }
    return [...types].filter(([t]) => GRAPH_TYPES.includes(t)).sort((x, y) => y[1] - x[1]).map(([t]) => t);
  }

  function snapshot(pc, limit = 60) {
    const rank = pageRank(pc);
    const blocked = vetoed(pc);
    const all = nodesOf.all(pc);
    const top = all
      .map((n) => ({ ...n, score: n.id === USER ? 1 : rank.get(n.id) ?? 0, vetoed: blocked.has(n.id) }))
      .sort((a, b) => (b.id === USER) - (a.id === USER) || b.score - a.score)
      .slice(0, limit);
    const keep = new Set(top.map((n) => n.id));
    const edges = edgesOf.all(pc).filter((e) => keep.has(e.a) && keep.has(e.b));
    return { nodes: top, edges, totals: stats(pc) };
  }

  function reset(pc) {
    transaction(() => {
      for (const table of ["pc_nodes", "pc_edges", "pc_type_tokens"]) db.prepare(`DELETE FROM ${table} WHERE pc = ?`).run(pc);
    });
    return { reset: true };
  }

  function inferType(pc, text) {
    const counts = new Map(GRAPH_TYPES.map((t) => [t, new Map()]));
    for (const [type, words] of Object.entries(SEED_VOCABULARY))
      for (const w of words.split(" ")) counts.get(type).set(w, (counts.get(type).get(w) ?? 0) + SEED_WEIGHT);
    if (pc) for (const { token, type, n } of tokensOf.all(pc)) counts.get(type)?.set(token, (counts.get(type).get(token) ?? 0) + n * 2);
    const vocabulary = new Set([...counts.values()].flatMap((m) => [...m.keys()]));
    const tokens = tokenize(text).filter((t) => vocabulary.has(t));
    if (!tokens.length) return { type: "movie", confidence: 0, matched: [] };
    const logp = GRAPH_TYPES.map((type) => {
      const m = counts.get(type);
      const total = [...m.values()].reduce((s, n) => s + n, 0);
      return tokens.reduce((s, t) => s + Math.log(((m.get(t) ?? 0) + 1) / (total + vocabulary.size)), 0);
    });
    const top = Math.max(...logp);
    const z = logp.reduce((s, v) => s + Math.exp(v - top), 0);
    const best = logp.indexOf(top);
    return { type: GRAPH_TYPES[best], confidence: Number((1 / z).toFixed(3)), matched: tokens };
  }

  return { syncSignals, linkQloo, feedback, scores, suggest, because, lovedTypes, snapshot, stats, reset, inferType };
}
