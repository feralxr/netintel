# netintel

A self-hosted DNS observability and network intelligence platform built on [Technitium DNS Server](https://technitium.com/dns/). Everything runs on your LAN — no cloud, no telemetry, no external server ever sees your data.

**100 metrics** across domain, security, performance, device, trends, behavioral, reporting, protocol, DHCP, capacity, and infrastructure — computed from your own real DNS traffic, surfaced identically across a **web dashboard**, a **CLI** (with switchable ASCII chart styles and a `--json` mode for scripting), and an **alerting** engine that can trigger on either DNS-traffic conditions or system/security signals.

**Supported platforms: Windows 10/11 and Linux.** macOS is not a target.

---

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md) | Full network setup guide — topologies, Technitium install, DHCP config, resilience/fallback options |
| [`docs/METRICS.md`](docs/METRICS.md) | Every metric netintel computes, generated directly from the metrics registry so it can't drift out of date |
| [`docs/CLI.md`](docs/CLI.md) | Full CLI command reference, chart styles, `--json` scripting |
| [`docs/ALERTING.md`](docs/ALERTING.md) | Alert condition types, the system/security metric catalog, worked policy examples |
| [`docs/NETWORK_LOCKDOWN.md`](docs/NETWORK_LOCKDOWN.md) | Preventing DoH/DoT/DoQ bypass so devices can't route around Technitium |
| [`docs/WINDOWS_TESTING.md`](docs/WINDOWS_TESTING.md) | Step-by-step guide for verifying a live install against a real Technitium instance |

---

## What's in this repo

```
netintel/
  packages/
    shared/    — types, the 100-metric registry (shared by CLI + web), category taxonomy
    server/    — API, collector, analytics engine, alerting/policy engine, notification/export engines
    cli/       — the `netintel` command-line tool
  apps/
    web/       — the dashboard (React + Vite + TanStack Router)
  docs/
    SETUP.md              — complete network setup guide
    METRICS.md             — generated reference for all 100 metrics
    CLI.md                  — full CLI command reference
    ALERTING.md             — alert condition types and examples
    NETWORK_LOCKDOWN.md     — DoH/DoT/DoQ bypass-prevention guide
    WINDOWS_TESTING.md      — live-instance/Windows verification checklist
  packaging/
    linux/     — systemd service + install script
    windows/   — Windows service install script (NSSM-based) + runner
  test/        — vitest global setup (shared throwaway test DB)
```

---

## Prerequisites

- **Node.js 20+** (Windows: [nodejs.org](https://nodejs.org) installer; Linux: your distro's package or [nodesource](https://github.com/nodesource/distribution))
- **Technitium DNS Server** running somewhere on your LAN, with an API token generated (Administration → Sessions → Create Token). See [`docs/SETUP.md`](docs/SETUP.md) for a full walkthrough, or [technitium.com/dns](https://technitium.com/dns/) for their own docs.
- Git

No Bun, no Docker required — plain Node.js was chosen specifically for solid Windows support.

---

## Quickstart

netintel only ever runs against a **real Technitium DNS Server** — there is no mock/demo mode. You need Technitium installed and reachable before running any of this (see [`docs/SETUP.md`](docs/SETUP.md) if you haven't set that up yet).

1. In Technitium's web UI: **Administration → Sessions → Create Token**. Copy it.
2. Clone and install:

```bash
git clone <this-repo>
cd netintel
npm install
npm run build
```

3. Set up your config:

```bash
cd packages/server
cp .env.example .env
# edit .env: set NETINTEL_TECHNITIUM_URL and NETINTEL_TECHNITIUM_TOKEN
cd ../..
```

4. Run database migrations:

```bash
npm run db:migrate
```

5. Start the server:

```bash
npm run dev:server
```

6. In a second terminal, start the dashboard:
```bash
npm run dev:web
```

Open http://localhost:5173. The CLI works too (optionally with its own `packages/cli/.env` — see `.env.example` there — if `NETINTEL_API_URL` isn't `http://localhost:8787`):

```bash
cd packages/cli
npm run start -- status
```

If `netintel status` shows `Technitium reachable: no`, double-check the URL/token in your `.env`, then see the troubleshooting table in [`docs/SETUP.md`](docs/SETUP.md).

**A few metrics are honestly reported as unavailable** rather than guessed at, because the fields they'd depend on haven't been confirmed present in a real Technitium API response yet (DNSSEC validation status, response payload size, EDNS0/TC-bit usage, CNAME chain depth's exact format). See [`docs/CLI.md`](docs/CLI.md#known-data-gaps) for the current list and [`docs/WINDOWS_TESTING.md`](docs/WINDOWS_TESTING.md) if you want to help confirm one of them against your own instance.

---

## Environment variables

Server/collector variables go in `packages/server/.env`; CLI variables go in `packages/cli/.env` (or your working directory). Copy from the adjacent `.env.example` in each package. Shell-exported variables still work too if you prefer them (dotenv won't override a variable that's already set in the environment).

| Variable | Default | Purpose |
|---|---|---|
| `NETINTEL_PORT` | `8787` | API server port |
| `NETINTEL_TECHNITIUM_URL` | — | **required** — e.g. `http://192.168.1.10:5380` |
| `NETINTEL_TECHNITIUM_TOKEN` | — | **required** — from Technitium's Administration → Sessions |
| `NETINTEL_DATA_DIR` | OS-appropriate default | where the SQLite database lives |
| `NETINTEL_DB_PATH` | `<data-dir>/netintel.db` | override the exact DB file path |
| `NETINTEL_API_URL` | `http://localhost:8787` | (CLI only) which API to talk to |
| `NETINTEL_SMTP_HOST` | — | (optional) SMTP server, only needed for an alert channel like `email:you@example.com` |
| `NETINTEL_SMTP_PORT` | `587` | (optional) SMTP port |
| `NETINTEL_SMTP_SECURE` | `false` | (optional) use implicit TLS |
| `NETINTEL_SMTP_USER` / `NETINTEL_SMTP_PASS` | — | (optional) SMTP auth |
| `NETINTEL_SMTP_FROM` | `netintel@localhost` | (optional) From address for alert emails |

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
netintel devices                # live devices, idle detection, vendor hints, rate ranking
netintel domain <domain>        # full metric drill-down for one domain
netintel security               # NXDOMAIN, entropy, tunneling heuristics, blocklist attribution
netintel performance             # cache/DNS performance, per-client latency, protocol features
netintel protocol                # query types, IPv4/IPv6 mix, CNAME depth, DoH/DoT/DoQ bypass
netintel dhcp                    # lease churn, duration, identity continuity
netintel system                  # capacity forecasts, host health, restart/outage history
netintel report                  # weekly/monthly reports, churn/retention, storage footprint
netintel behavioral               # routine detection, periodicity, session overlap
netintel explain [metric]        # explain any of the 100 metrics (or list a group)
netintel config                  # view/set persisted CLI preferences (chart style)
netintel notifications           # categorized notification feed
netintel watch                   # live streaming view (--json for NDJSON)
netintel export --level <1-4> --format <json|csv|md|html|sqlite|parquet|pdf>
```

Every command supports `--json` for scripting, and time-series charts support `--chart <line|sparkline|braille>`. Full reference: [`docs/CLI.md`](docs/CLI.md).

---

## Alerting

Policies can trigger on DNS-traffic conditions (Explorer-style queries against your traffic) or on system/security metrics (host memory, collector uptime, DHCP churn, DNSSEC/tunneling signals, disk capacity, and more) — combinable in one policy with AND/OR logic. Full reference, including the complete metric catalog and worked examples: [`docs/ALERTING.md`](docs/ALERTING.md).

---

## Testing

```bash
npm test           # run once
npm run test:watch # watch mode
```

A global setup script creates and migrates a real throwaway SQLite database (via the actual drizzle migrator, not a hand-maintained test schema) before the suite runs.

---

## License

MIT — see [`LICENSE`](LICENSE). See that file for the tradeoff considered against AGPL.
