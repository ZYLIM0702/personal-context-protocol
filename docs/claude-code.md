# Personal Context in Claude Code

`pcp mcp` is an MCP server (stdio) that gives Claude Code, or any MCP client, your Personal Context
PC. Before Claude recommends a movie, album, book or place, it sends its own candidates to
`pcp_rerank`. They come back re-weighted by Qloo taste affinity and your on-device model, and your
reactions train that model locally.

## 1. Run a PCP server

`pcp_rerank` calls a PCP server (`PCP_URL`, default `http://127.0.0.1:8787`). Run one locally:

```sh
npm install -g github:ZYLIM0702/personal-context-protocol
npm install -g @qloo/qloo-harness && qloo setup --qloo     # Qloo credential for live scoring
pcp serve                                                   # http://127.0.0.1:8787
```

Without a Qloo credential everything still works. `pcp_rerank` reports the Qloo error and returns
Claude's own distribution, adjusted by your model.

## 2. Add the MCP server

Choose one. Put `-e` options after the server name and before `--`.

```sh
# Global install (recommended)
npm install -g github:ZYLIM0702/personal-context-protocol
claude mcp add personal-context -- pcp mcp

# No install: npx from GitHub
claude mcp add personal-context -- npx -y -p github:ZYLIM0702/personal-context-protocol pcp mcp

# A local clone (after npm install in the clone)
claude mcp add personal-context -- node /abs/path/to/personal-context-protocol/bin/pcp.mjs mcp

# With settings
claude mcp add personal-context \
  -e PCP_URL=http://127.0.0.1:8787 \
  -e PCP_PASSPORT=$HOME/.pcp/passport.json \
  -e 'PCP_PASSPHRASE=${PCP_PASSPHRASE}' \
  -- pcp mcp
```

`--scope local` (the default) is for you in the current project, `--scope user` covers all your
projects, and `--scope project` writes a shared `.mcp.json`. Check with `claude mcp list` (it should
show `personal-context: ... ✔ Connected`), and remove with `claude mcp remove personal-context -s local`.

**Keep the passphrase out of config files.** `-e PCP_PASSPHRASE=secret` is stored as plain text in
`~/.claude.json`. Write `-e 'PCP_PASSPHRASE=${PCP_PASSPHRASE}'` (single quotes) to store only the
reference, then `export PCP_PASSPHRASE=...` before you start `claude`. Claude Code expands it at launch
and also passes its own environment to the server.

### Project `.mcp.json`

This repository ships a [`.mcp.json`](../.mcp.json) that runs `node bin/pcp.mjs mcp` from the repo root.
Claude Code asks you to approve it the first time you start `claude` there. Every value is read from
your environment, with defaults:

```json
{
  "mcpServers": {
    "personal-context": {
      "type": "stdio",
      "command": "node",
      "args": ["bin/pcp.mjs", "mcp"],
      "env": {
        "PCP_URL": "${PCP_URL:-http://127.0.0.1:8787}",
        "PCP_PASSPORT": "${PCP_PASSPORT:-}",
        "PCP_PASSPHRASE": "${PCP_PASSPHRASE:-}",
        "PCP_QLOO_API_KEY": "${PCP_QLOO_API_KEY:-}"
      }
    }
  }
}
```

In another project, use `"command": "pcp", "args": ["mcp"]` after a global install.

### Skill

[`.claude/skills/personal-context/SKILL.md`](../.claude/skills/personal-context/SKILL.md) teaches Claude to
call `pcp_rerank` before recommending, to report Qloo status honestly, and to call `pcp_feedback` on your
reactions. It is active in this repository. To use it everywhere, copy it:

```sh
mkdir -p ~/.claude/skills && cp -r .claude/skills/personal-context ~/.claude/skills/
```

The tool descriptions and server instructions carry the same guidance, so the server works without
the skill.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PCP_URL` | `http://127.0.0.1:8787` | PCP server used by `pcp_rerank` and `pcp_status` |
| `PCP_PASSPORT` | `~/.pcp/passport.json` | PC file, created on first use (mode 600) |
| `PCP_PASSPHRASE` | unset | Encrypts the PC at rest (AES-256-GCM, PBKDF2-SHA256 310k). An encrypted file needs it to open. |
| `PCP_QLOO_API_KEY` | unset | Your own Qloo key, sent as `x-qloo-api-key` with each rerank when the server has none |

The passphrase and keys are never logged. Logs go to stderr, because stdout is the MCP channel.

## Tools

| Tool | Input | What it does | When Claude should call it |
| --- | --- | --- | --- |
| `pcp_status` | none | PC summary (file, encrypted at rest, signals, vetoes, weights, update count, last feedback) and server status (`reachable`, `qloo_ready`) | The user asks about their profile, or another tool fails |
| `pcp_add_signal` | `name`, `type` | Adds a public favorite as a taste signal; returns the new disclosure | The user names a favorite |
| `pcp_rerank` | `type`, `candidates: [{ name, prior? }]` (1 to 10) | Sends the candidates and `disclose(passport)` to `POST /v1/rerank`, computes the distribution locally, and caches it for feedback. Returns `ranked` (`rank`, `name`, `p`, `p_agent`, `qloo`, `qloo_kind`, `qloo_match`), `vetoed`, `qloo` (`status`, `summary`, `error`, `unresolved`), `weights` and `notes` | Before recommending anything of these types |
| `pcp_feedback` | `name`, `liked` | One local gradient step on the most recent rerank that contains `name`. A like adds a signal and a dislike adds a veto. Returns the old and new weights and the new distribution | The user accepts or rejects a presented option |
| `pcp_disclose` | none | Exactly what leaves the device with a rerank: the latest 10 signals (name, type), the vetoes (name, type) and the 3 weights | Privacy questions |

Types: `artist`, `book`, `brand`, `movie`, `person`, `place`, `podcast`, `tv_show`.

Missing priors are filled with the mean of the given priors, or a uniform prior when none are given.
The rerank cache is kept in memory for the session (the last 5 reranks). The CLI's `.last.json` is
separate, so call `pcp_feedback` after `pcp_rerank` in the same session.

## Example session

> **You:** Recommend a sci-fi movie for tonight.
>
> Claude drafts `Arrival 0.3, Inception 0.5, Her 0.2` and calls `pcp_rerank`.

```json
{
  "type": "movie",
  "ranked": [
    { "rank": 1, "name": "Inception", "p": 0.5, "p_agent": 0.5, "qloo": null, "qloo_kind": null, "qloo_match": null },
    { "rank": 2, "name": "Arrival", "p": 0.3, "p_agent": 0.3, "qloo": null, "qloo_kind": null, "qloo_match": null },
    { "rank": 3, "name": "Her", "p": 0.2, "p_agent": 0.2, "qloo": null, "qloo_kind": null, "qloo_match": null }
  ],
  "vetoed": [],
  "qloo": {
    "status": "error",
    "summary": "Qloo workflow execution requires a configured Qloo API credential.",
    "error": { "code": "QLOO_AUTH", "retryable": false },
    "unresolved": []
  },
  "weights": [1, 1, 1],
  "notes": ["Qloo did not score these options (status: error). ..."]
}
```

> **Claude:** Taste scoring is unavailable right now, so this is my own ranking: 1. Inception ...
>
> **You:** I'll watch Arrival.
>
> Claude calls `pcp_feedback { "name": "Arrival", "liked": true }`, and the weights move from `[1, 1, 1]` to `[0.8456, 1, 1]`.

With Qloo configured, `qloo` holds each option's affinity (`qloo_kind: "affinity"`, or `"rank"` when
Qloo returns only an order), and `p` moves toward your taste. If Qloo cannot match an option or a signal,
`qloo.unresolved` lists it with suggested `candidates`.

## Troubleshooting

- **`Could not reach the PCP server`**: start `pcp serve`, or set `PCP_URL`.
- **`The passport ... is encrypted. Set PCP_PASSPHRASE`**: the server was started without the passphrase.
- **`Wrong passphrase or damaged passport`**: the passphrase does not match the file.
- **`... is not in a recent pcp_rerank result`**: call `pcp_rerank` with a list that includes it first.
- **The server is missing from `claude mcp list`**: check the scope (`claude mcp get personal-context`), and check that `pcp` is on the `PATH` Claude Code sees (`which pcp`), or use the `node /abs/path/bin/pcp.mjs mcp` form.
