# PCP CLI

`pcp` uses a Personal Context PC from the terminal, scripts and local agents. The PC file
stays on your machine, and training (`like` / `nope`) runs locally. The same binary runs the reference
server (`pcp serve`) and the MCP server for Claude Code (`pcp mcp`, see [claude-code.md](claude-code.md)).

Requires Node.js 22.19+.

## Install

| Option | Command | Then run |
| --- | --- | --- |
| Global from GitHub | `npm install -g github:ZYLIM0702/personal-context-protocol` | `pcp help` |
| Global from a clone | `git clone https://github.com/ZYLIM0702/personal-context-protocol && cd personal-context-protocol && npm install -g .` | `pcp help` |
| No install (npx) | `npx -y -p github:ZYLIM0702/personal-context-protocol pcp help` | |
| From a clone, no global | `npm install` | `node bin/pcp.mjs help` |

For live Qloo scoring, the server also needs the Qloo harness and a credential:

```sh
npm install -g @qloo/qloo-harness
qloo setup --qloo            # or set QLOO_API_KEY for the server
```

## Quick start

```sh
pcp serve &                                          # API + demo page on http://127.0.0.1:8787
export PCP_PASSPORT=~/.pcp/passport.json             # the same file `pcp mcp` uses by default
export PCP_PASSPHRASE='a long passphrase'            # optional: encrypt the file at rest
pcp add --name "Radiohead" --type artist
pcp rerank --type movie --candidates "Arrival=0.3,Inception=0.5,Her=0.2"
pcp like --name "Arrival"
```

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PCP_URL` | `http://127.0.0.1:8787` | PCP server for `rerank` (`--server` overrides it) |
| `PCP_PASSPORT` | `./passport.json` (CLI), `~/.pcp/passport.json` (`pcp mcp`) | PC file (`--passport` overrides it) |
| `PCP_PASSPHRASE` | unset | When set, the PC is AES-256-GCM encrypted at rest (PBKDF2-SHA256, 310k iterations) |
| `PCP_QLOO_API_KEY` | unset | Your own Qloo key, sent as `x-qloo-api-key` with each rerank when the server has none |

Set `PCP_PASSPORT` to the same path for the CLI and `pcp mcp` so both use one PC.

Entity types: `artist`, `book`, `brand`, `movie`, `person`, `place`, `podcast`, `tv_show`.

## Commands

### `pcp help`

Lists every command (`pcp`, `pcp --help` and `pcp -h` do the same). An unknown command prints the
same text and exits with code 1.

### `pcp init`

Creates a new, empty PC (overwrites the file).

```sh
$ pcp init
{
  "created": "/Users/me/.pcp/passport.json",
  "encrypted": true
}
```

### `pcp add --name <name> --type <type>`

Adds a public entity you love as a taste signal (type defaults to `artist`). Prints what would leave
the device.

```sh
$ pcp add --name "Radiohead" --type artist
{
  "protocol": "pcp/0.1",
  "signals": [{ "name": "Radiohead", "type": "artist" }],
  "vetoes": [],
  "policy": { "weights": [1, 1, 1] }
}
```

### `pcp rerank --type <type> --candidates "<name>=<prior>,..."`

Sends an agent's options and `disclose(passport)` to `POST /v1/rerank`, then prints the re-weighted
distribution. Priors are optional (`"Arrival,Inception"` uses a uniform prior). The result is cached in
`<passport>.last.json` for `like` / `nope`.

When Qloo has no credential, the status says so and the distribution is the agent's own, adjusted by
your model:

```sh
$ pcp rerank --type movie --candidates "Arrival=0.3,Inception=0.5,Her=0.2"
{
  "qloo": {
    "status": "error",
    "summary": "Qloo workflow execution requires a configured Qloo API credential."
  },
  "distribution": [
    { "name": "Inception", "p": 0.5, "p_agent": 0.5, "qloo": null },
    { "name": "Arrival", "p": 0.3, "p_agent": 0.3, "qloo": null },
    { "name": "Her", "p": 0.2, "p_agent": 0.2, "qloo": null }
  ]
}
```

With Qloo configured, `qloo` holds each option's affinity and `p` moves toward your taste.

### `pcp like --name <name>`

One gradient step toward that option on the last rerank. The option becomes a signal.

```sh
$ pcp like --name "Arrival"
{
  "weights": [0.9128401048693187, 1],
  "updates": 1,
  "distribution": [
    { "name": "Inception", "p": 0.4853, "p_agent": 0.5, "qloo": null },
    { "name": "Arrival", "p": 0.3044, "p_agent": 0.3, "qloo": null },
    { "name": "Her", "p": 0.2103, "p_agent": 0.2, "qloo": null }
  ]
}
```

### `pcp nope --name <name>`

One gradient step away from that option. The option is vetoed and dropped from future rankings.

```sh
$ pcp nope --name "Inception"
{
  "weights": [0.7387530743571911, 1],
  "updates": 2,
  "distribution": [
    { "name": "Arrival", "p": 0.5743, "p_agent": 0.6, "qloo": null },
    { "name": "Her", "p": 0.4257, "p_agent": 0.4, "qloo": null }
  ]
}
```

### `pcp show`

Prints the full, decrypted PC (ID, signals, vetoes, model, history). It never leaves the device.

```sh
$ pcp show
{
  "protocol": "pcp/0.1",
  "id": "614252c3-0c03-45ab-a912-49a6ca070bd1",
  "signals": [
    { "name": "Radiohead", "type": "artist", "source": "seed", "at": "2026-10-31T03:58:01.997Z" },
    { "name": "Arrival", "type": "movie", "source": "accepted", "at": "2026-10-31T03:58:02.746Z" }
  ],
  "vetoes": [{ "name": "Inception", "type": "movie", "at": "2026-10-31T03:58:02.811Z" }],
  "policy": { "model": "conditional-logit/v1", "weights": [0.7387530743571911, 1], "updates": 2, ... },
  ...
}
```

A wrong passphrase prints `Wrong passphrase or damaged passport` and exits with code 1.

### `pcp serve [--port 8787] [--host 127.0.0.1] [--env .env]`

Starts the reference server (`node server.mjs` from the installed package): the `/v1/rerank` API, the
demo page and the encrypted vault. `--port` and `--host` set `PORT` / `HOST`. A `.env` in the current
directory (or the file given with `--env`) is loaded for variables that are not already set, which is
how a global install gets `QLOO_API_KEY` and the agent keys. Ctrl-C stops it.

```sh
$ pcp serve --port 8799
Personal Context server on http://127.0.0.1:8799
```

### `pcp mcp`

Runs the MCP server on stdio for Claude Code and other MCP clients. stdout is the MCP channel and logs
go to stderr. Tools and setup: [claude-code.md](claude-code.md).

```sh
$ pcp mcp
[pcp mcp] ready: passport /Users/me/.pcp/passport.json (encrypted at rest), server http://127.0.0.1:8787
```

## Privacy

`rerank` sends only the type, the candidate names and priors, and `disclose(passport)`: the latest 10
signals (name, type), the vetoes (name, type) and the 3 weights. The ID, history and timestamps stay local.
The `.last.json` cache is plaintext even when the PC is encrypted.
