# netintel

A self-hosted DNS observability and network intelligence platform built on [Technitium DNS Server](https://technitium.com/dns/). Everything runs on your LAN — no cloud, no telemetry, no external server ever sees your data.

See [`docs/NETINTEL_V1_BIBLE.md`](docs/NETINTEL_V1_BIBLE.md) for the full v1 spec (architecture, all 50 metrics, database design, roadmap), and [`docs/SETUP.md`](docs/SETUP.md) for the complete network setup guide — every topology option, DHCP configuration, and fallback/resilience configuration (router fallback to public DNS, dual-Technitium-instance failover, auto-restart, etc.).

**Supported platforms: Windows 10/11 and Linux.** macOS is not a v1 target.

---

## What's in this repo

```
netintel/
  packages/
    shared/    — types, the 50-metric registry (shared by CLI + web), category taxonomy
    server/    — API, collector, analytics engine, notification/export engines
    cli/       — the `netintel` command-line tool
  apps/
    web/       — the dashboard (React + Vite + TanStack Router)
  docs/
    NETINTEL_V1_BIBLE.md      — full v1 specification
    SETUP.md                  — complete network setup guide (topologies, DHCP, fallback configs)
    NETWORK_LOCKDOWN.md       — DoH/DoT/DoQ bypass-prevention guide
  packaging/
    linux/     — systemd service + install script
    windows/   — Windows service install script (NSSM-based) + runner
```

---

## Prerequisites

- **Node.js 20+** (Windows: [nodejs.org](https://nodejs.org) installer; Linux: your distro's package or [nodesource](https://github.com/nodesource/distribution))
- **Technitium DNS Server** running somewhere on your LAN, with an API token generated (Administration → Sessions → Create Token). See the [Technitium docs](https://technitium.com/dns/) for install instructions on both Windows and Linux.
- Git

No Bun, no Docker required for v1 — plain Node.js was chosen specifically for solid Windows support (see the bible, tech stack section).

---

## Quickstart

netintel only ever runs against a **real Technitium DNS Server** — there is no mock/demo mode. You need Technitium installed and reachable before running any of this (see [`docs/SETUP.md`](docs/SETUP.md) if you haven't set that up yet).

1. In Technitium's web UI: **Administration → Sessions → Create Token**. Copy it.
2. Clone and install:

```bash
git clone <this-repo>
cd netintel
npm install
npm run build -w @netintel/shared
```

3. Set up your config:

```bash
cd packages/server
cp .env.example .env
# edit .env: set NETINTEL_TECHNITIUM_URL and NETINTEL_TECHNITIUM_TOKEN
cd ../..
```

4. Start the server:

```bash
npm run dev:server
```

5. In a second terminal, start the dashboard:
```bash
npm run dev:web
```

Open http://localhost:5173. The CLI works too (optionally with its own `packages/cli/.env` — see `.env.example` there — if `NETINTEL_API_URL` isn't `http://localhost:8787`):

```bash
cd packages/cli
npm run start -- status
```

If `netintel status` shows `Technitium reachable: no`, double-check the URL/token in your `.env` — see the troubleshooting table in `docs/SETUP.md`.

> **v1 limitation, corrected after live testing:** Technitium's `/api/logs/query` *does* return per-query latency (`responseRtt`), but only for Recursive lookups — Cached/Blocked/Authoritative entries have no RTT since there's no upstream round trip (their real latency is genuinely ~0). Metrics #18, #22, and #23 use real data as of this fix. **Metric #21 (TTL) and #24 (Upstream Comparison) remain genuinely unconfirmed** — `answerTtl` and `upstream` haven't been verified present in a real response yet; they'll show "no data" against a live instance until that's confirmed one way or the other.

---

## Environment variables

All of these go in `packages/server/.env` (server/collector) or `packages/cli/.env` (CLI) — copy from the adjacent `.env.example` in each package. Shell-exported variables still work too if you prefer them (dotenv won't override a variable that's already set in the environment).

| Variable | Default | Purpose |
|---|---|---|
| `NETINTEL_PORT` | `8787` | API server port |
| `NETINTEL_TECHNITIUM_URL` | — | **required** — e.g. `http://192.168.1.10:5380` |
| `NETINTEL_TECHNITIUM_TOKEN` | — | **required** — from Technitium's Administration → Sessions |
| `NETINTEL_DATA_DIR` | OS-appropriate default | where the SQLite database lives |
| `NETINTEL_DB_PATH` | `<data-dir>/netintel.db` | override the exact DB file path |
| `NETINTEL_API_URL` | `http://localhost:8787` | (CLI only) which API to talk to |

Default data directory if `NETINTEL_DATA_DIR` isn't set:
- **Windows:** `%ProgramData%\netintel`
- **Linux (root):** `/var/lib/netintel`
- **Linux (non-root):** `~/.local/share/netintel`

---

## Production setup

### 1. Build everything

```bash
npm install
npm run build
```

### 2. Run database migrations

```bash
cd packages/server
npm run db:migrate
```

### 3. Install as a service

- **Linux (systemd):** see [`packaging/linux/README.md`](packaging/linux/README.md)
- **Windows (service via NSSM):** see [`packaging/windows/README.md`](packaging/windows/README.md)

### 4. Lock down the network

Set up DoH/DoT/DoQ bypass prevention on your router/firewall so devices can't route around Technitium. See [`docs/NETWORK_LOCKDOWN.md`](docs/NETWORK_LOCKDOWN.md).

### 5. Serve the dashboard

```bash
cd apps/web
npm run build
# dist/ is a static site — serve it with any static file server,
# or point the server's static-file middleware at it (see packaging docs)
```

---

## CLI

```bash
netintel status                 # engine health, live device count
netintel devices                # live devices on the LAN
netintel domain <domain>        # full metric drill-down for one domain
netintel explain [metric]       # explain any of the 50 metrics (or list them all)
netintel notifications          # categorized notification feed
netintel watch                  # live streaming view
netintel export --level <1-4> --format <json|csv|md>
```

---

## License

MIT — see [`LICENSE`](LICENSE). See that file for the tradeoff considered against AGPL.
