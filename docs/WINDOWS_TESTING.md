# netintel — Live-Instance & Windows Testing Guide

Covers: getting netintel running on Windows against your real Technitium instance, confirming the fields/behaviors that are still flagged unconfirmed in the code, and a full walkthrough of every web page, CLI command, and alert path. Work through it top to bottom — later phases assume earlier ones passed.

Keep notes as you go (a plain text file is fine) — the final phase tells you exactly what to send back.

---

## Phase 0 — Prerequisites

- [ ] Windows 10/11 machine (officially supported target — confirmed in `package.json`'s `"os"` field)
- [ ] [Node.js 20+](https://nodejs.org) installed, confirm with `node --version` in PowerShell
- [ ] A running Technitium DNS Server instance you can reach on your LAN, with an API token
  - Technitium web UI → **Administration → Sessions → Create Token**
  - You'll need the **web UI port** (default `5380`), not the DNS port (53)
- [ ] Git installed, or download the repo as a zip from GitHub

---

## Phase 1 — Get it running (dev mode — do this before the full service install)

Dev mode is faster to iterate on and easier to see errors from directly. Save the NSSM/service install (`packaging/windows/install.ps1`) for after everything checks out here.

1. Clone or download the repo, open **PowerShell** in the repo root.
2. Install dependencies (this also compiles `better-sqlite3`'s native module for Windows — if this step fails, see Phase 8's native-module note):
   ```powershell
   npm install
   ```
3. Build everything:
   ```powershell
   npm run build
   ```
4. Configure the server:
   ```powershell
   Copy-Item packages\server\.env.example packages\server\.env
   notepad packages\server\.env
   ```
   Set at minimum:
   ```
   NETINTEL_TECHNITIUM_URL=http://<your-technitium-ip>:5380
   NETINTEL_TECHNITIUM_TOKEN=<your real token>
   ```
   Leave `NETINTEL_DATA_DIR` unset — it'll default to `%ProgramData%\netintel` on Windows (see `db/paths.ts`). If you'd rather it live somewhere without admin rights, set it explicitly to something like `NETINTEL_DATA_DIR=C:\Users\<you>\netintel-data`.
5. Run migrations:
   ```powershell
   cd packages\server
   npm run db:migrate
   cd ..\..
   ```
   - [ ] Confirm it prints `migrations complete` with no errors, and applies **6 migrations** (0000 through 0005).
6. Boot the server:
   ```powershell
   npm run dev:server
   ```
   - [ ] Confirm you see `[netintel] api listening on http://localhost:8787`
   - [ ] Confirm you **don't** see `cannot reach Technitium` — if you do, double-check the URL/token in `.env` before moving on. Nothing past this point works meaningfully without a real connection.
7. In a **second** PowerShell window, boot the web dashboard:
   ```powershell
   npm run dev:web
   ```
   - [ ] Open `http://localhost:5173` in a browser, confirm the Overview page loads with no console errors (F12 → Console tab)

---

## Phase 2 — Confirm real data is actually flowing

Before testing any specific feature, make sure the collector is really pulling from your Technitium instance.

1. Generate some real traffic — browse a few sites from any device on your network, or `nslookup example.com <technitium-ip>` a few times from the Windows machine itself.
2. Wait ~30 seconds (default poll interval), then check:
   ```powershell
   curl http://localhost:8787/api/status
   ```
   - [ ] `technitiumReachable: true`
   - [ ] `liveDeviceCount` is nonzero
   - [ ] `lastEventAt` is recent (within the last minute or so)
3. Check the CLI sees it too:
   ```powershell
   $env:NETINTEL_API_URL = "http://localhost:8787"
   npm run cli -- status
   ```
   - [ ] Matches what you saw via curl

If this phase doesn't pass, stop here — everything downstream depends on it.

---

## Phase 3 — Resolve the fields still flagged unconfirmed in the code

These are called out by name in code comments as needing exactly this kind of live verification. For each, the goal is: **look at the raw JSON your actual Technitium instance returns**, and compare it against what the code assumes.

### 3a. Confirm your Technitium version supports the fields netintel expects

In your browser, go to your Technitium web UI → **Help → API Documentation** (or `http://<technitium-ip>:5380/api/docs` depending on version). Find the `/api/logs/query` (or equivalent query-log) endpoint docs.

- [ ] Note your Technitium version number (needed either way for your report)

### 3b. `responseRtt` (per-query latency) — previously confirmed, quick recheck only

`technitium-client.ts` has a comment saying this was already confirmed against a live v13+ instance (via the "Query Logs (Sqlite)" app) — milliseconds, populated only for recursive lookups, null for cached/blocked/authoritative. Quick sanity check:

```powershell
npm run cli -- performance
```
- [ ] "Avg DNS latency" shows a real, non-zero number (not "no data yet")
- [ ] If your Technitium version is older than v13 or you're not running the Query Logs (Sqlite) app, flag this explicitly — the original confirmation may not hold for your setup

### 3c. `answerTtl` and `upstream` fields

These feed metric #21 (TTL analytics) and #24 (upstream comparison).

```powershell
npm run cli -- performance
```
- [ ] Look for a TTL-related section — does it show real numbers, or a "no data" note?
- [ ] Check "Upstream resolver comparison" — does it list real upstream server addresses, or say `hasData: false`?

If either shows "no data" despite you having real recursive queries flowing, that's the signal these fields aren't populated the way the code expects on your Technitium version — note it for the report.

### 3d. `answer_data` and CNAME chain depth (#87) — genuinely never confirmed

This is the newest and most explicitly-flagged-unconfirmed field. The code guesses the raw `answer` field's format (counting literal `"CNAME"` occurrences as a depth proxy) with zero real-instance evidence behind it.

```powershell
npm run cli -- protocol
```
- [ ] Look at "CNAME chain depth" — does it say `hasData: false` (meaning `answer_data` isn't even being populated by the collector), or does it show numbers?
- [ ] If it shows numbers: visit a site you know uses CNAME redirection (many CDN-fronted sites do — e.g. check a site using Cloudflare or a tracker-heavy news site) and see if the depth number looks sane (1–3 is typical; 0 or something huge suggests the parsing heuristic is wrong)
- [ ] **Best verification**: temporarily add a debug log line in `technitium-client.ts` (or just check Technitium's raw query-log API response directly via `curl`) to see the literal `answer` field's format, then compare it against what `analytics/protocol.ts`'s `cnameChainDepth()` assumes (see the `KNOWN GAP` comment there for exactly what it's guessing)

### 3e. Fields confirmed *absent* — verify that's actually true for your version

The code currently reports these as flatly unavailable rather than guessing. Worth double-checking your Technitium version doesn't expose them somewhere netintel isn't looking:

- [ ] DNSSEC validation status (feeds metric #66) — check Technitium's API docs for anything DNSSEC-related on the query log endpoint
- [ ] Response payload size (metric #68)
- [ ] EDNS0 usage flag / TC-bit (truncated response) (part of #67)

```powershell
npm run cli -- performance
```
Look at the DNSSEC and response-size sections — if your Technitium version's API docs show these fields ARE available and netintel just isn't reading them, that's a real fixable gap, not a true absence. Note the exact field name from the docs if so.

### 3f. `block_domain` alert action endpoint

Used when an alert policy's action is configured to auto-block a domain. Calls `POST /api/blocking/blocked/add` with `token` and `domain` query params.

- [ ] In Technitium's API docs, confirm this exact path (`/api/blocking/blocked/add`) and its required params match
- [ ] **Test it for real** (pick a throwaway test domain you don't mind blocking, e.g. a subdomain you control, or just prepare to unblock afterward):
  ```powershell
  npm run cli -- explain block_domain 2>$null  # just confirms the CLI is up; the real test is below
  ```
  Then create a test policy via the web UI (Alerts page) with action = block a specific test domain, or trigger it directly:
  - Go to `http://localhost:5173/alerts`
  - Create a policy with a condition you can force to breach (e.g. `count > 0` over a 5-minute window with `AND`)
  - [ ] Confirm the domain actually gets blocked in Technitium's own UI afterward
  - [ ] Unblock it manually afterward if it was a real domain

---

## Phase 4 — Web dashboard walkthrough

For each page: **does it load without a blank screen or console error (F12), and does the data look real (not all zeros/dashes)?**

- [ ] `/` Overview
- [ ] `/network` Network
- [ ] `/devices` Devices — check idle detection, vendor hints (do real device MACs get sensible vendor guesses?), rate ranking
- [ ] `/domains` Domains — check the fragmentation and decay-score sections
- [ ] Click into a domain you've actually queried — `/domains/<a-real-domain>` — check daily history chart, response codes, burstiness, fragmentation
- [ ] `/security` — NXDOMAIN, entropy, suspicious TLDs, punycode, tunneling heuristics, blocklist attribution
- [ ] `/performance` — cache hit rate, per-client latency, protocol distribution
- [ ] `/protocol` — query types, IPv4/IPv6 mix, CNAME depth (see 3d above), PTR volume, DoH/DoT/DoQ bypass attempts
- [ ] `/history` — weekly report, category momentum, seasonal pattern, churn/retention
- [ ] `/map` Relationship Map — does the force-directed graph render? Check behavioral patterns section at the bottom
- [ ] `/explorer` — build a custom query, confirm it returns real results
- [ ] `/dashboards` — create a dashboard, add a panel
- [ ] `/reports` — monthly report, tool usage, storage footprint (real DB size/table breakdown)
- [ ] `/alerts` — see Phase 6 below
- [ ] `/synthetics` — set up a synthetic DNS probe if relevant to your setup
- [ ] `/system` — capacity forecasts, host resource utilization chart (see Phase 8 for the Windows-specific CPU caveat), restart history, collector outage log

---

## Phase 5 — CLI walkthrough

```powershell
npm run cli -- status
npm run cli -- devices
npm run cli -- domain <a-real-domain-you-visit>
npm run cli -- security
npm run cli -- performance
npm run cli -- protocol
npm run cli -- dhcp
npm run cli -- system
npm run cli -- report
npm run cli -- behavioral
npm run cli -- notifications
npm run cli -- explain
npm run cli -- explain domain_response_code_distribution
```
For each:
- [ ] Runs without throwing
- [ ] Output looks like real data, not all-empty tables

### Chart styles — check all three render correctly in your actual terminal

```powershell
npm run cli -- dhcp --chart line
npm run cli -- dhcp --chart sparkline
npm run cli -- dhcp --chart braille
```
- [ ] **Line** (asciichart box-drawing characters `┤┼╭╮╰╯`) — clean, no garbled characters
- [ ] **Sparkline** (block characters `▁▂▃▄▅▆▇█`) — clean
- [ ] **Braille** (dot-matrix `⠁⠂⠄⡀⢀...`) — this is the one most likely to look different across terminals. Test it in:
  - [ ] Windows Terminal (recommended, best Unicode support)
  - [ ] PowerShell's own console host (older rendering, may show boxes/question marks instead of dots)
  - [ ] `cmd.exe` if you use it — legacy console, most likely to render braille wrong

If braille looks broken in a given terminal, that's useful to know — not necessarily a bug to fix in netintel, but worth documenting as a "use Windows Terminal for the braille style" note.

### Config persistence

```powershell
npm run cli -- config
npm run cli -- config chart-style braille
npm run cli -- config
```
- [ ] Second `config` call shows `chart-style: braille`
- [ ] Check the file actually landed at `%USERPROFILE%\.netintel\cli-config.json`:
  ```powershell
  cat $env:USERPROFILE\.netintel\cli-config.json
  ```
- [ ] Run a command with no `--chart` flag and confirm it now defaults to braille:
  ```powershell
  npm run cli -- dhcp
  ```

---

## Phase 6 — Alerting, both condition types, against real data

### Explorer-based (original type)
1. Web UI → Alerts → create a policy with source = "DNS traffic (Explorer)", metric = `count`, a threshold low enough to definitely breach given your real traffic (e.g. `gt 0` over 15 minutes)
2. Wait for the scheduler to run (check `analytics/scheduler.ts`'s interval, or just wait a few minutes)
3. - [ ] Confirm an alert event actually fires — check the Alerts page's event log, or:
   ```powershell
   curl http://localhost:8787/api/alerts/events
   ```

### Metric-snapshot based (new type)
1. Web UI → Alerts → create a policy with source = "System / security metric", pick something you can realistically breach, e.g. `dhcp_lease_churn_today > 0` if you've had any device join/leave today
2. - [ ] Confirm it fires the same way

---

## Phase 6b — Explorer nested filters and dashboard drag/resize (added since this guide was first written)

These shipped after the core testing phases above, so they've had less real-world use — worth a dedicated look.

### Explorer nested filter groups
1. Go to `/explorer`, build a query with a top-level condition, then click **+ group** to add a nested AND/OR group, and add 2+ conditions inside it
2. - [ ] The nested group visually indents and shows its own AND/OR selector
3. - [ ] Running the query returns results consistent with the nested logic (test with a condition combination where a flattened evaluation would give a different count than a correct nested one — e.g. `domain = X AND (queryType = A OR responseCode = NXDOMAIN)`)
4. - [ ] Save the query as a view, reload the page, confirm the nested structure reloads correctly (round-trip through the saved-query JSON)
5. - [ ] Try 3 levels of nesting — confirm the "+ group" button disappears past the max depth rather than erroring

### Dashboard panel drag/resize
1. Go to a dashboard with at least 2 panels (create one via Dashboards → new dashboard → add panel from a saved Explorer query if you don't have one)
2. - [ ] Drag a panel by its header to a new position — does it move smoothly, and do other panels reflow around it?
3. - [ ] Drag a panel's corner to resize it — does the chart inside resize to fill the new space?
4. - [ ] Reload the page — does the layout you set persist, or does it reset to the original position?
5. - [ ] Remove a panel, confirm the remaining panels' positions are unaffected

---

## Phase 7 — Windows-specific checks

### 7a. `cpuLoadAvg1m` should be null, and everything should handle that gracefully
Node's `os.loadavg()` has no real implementation on Windows — it returns `[0,0,0]` or is otherwise not meaningful, which is why `infrastructure/health.ts` treats it as unavailable there.

```powershell
npm run cli -- system
```
- [ ] "Host CPU load (mean)" line either doesn't appear at all, or shows a note about it being unavailable — it should **not** show a confident-looking fake number
- [ ] Web UI `/system` page — same check on the host resource chart

If you see an actual numeric CPU value being treated as real on Windows, that's a bug — the code currently assumes it's always `null` there.

### 7b. Graceful shutdown (Ctrl+C) and restart tracking
Windows doesn't support POSIX signals the same way Linux does — `SIGTERM` in particular is unreliable on Windows; `SIGINT` (Ctrl+C) generally works in most terminals but can behave inconsistently depending on how the process was started (directly vs. via `npm run` wrapping it vs. as an NSSM service).

1. With the server running in the foreground (`npm run dev:server`), press **Ctrl+C**
   - [ ] Does it print `received SIGINT, shutting down...` and exit cleanly, or does it hang / get force-killed by the terminal?
2. Restart the server, then check restart history:
   ```powershell
   npm run cli -- system
   ```
   - [ ] Does the most recent entry show `clean` shutdown (if you Ctrl+C'd) or `unclean/running` (if you closed the terminal window instead)?
3. Try closing the PowerShell window directly (not Ctrl+C) instead, then restart and check again — this simulates a real crash/unclean stop, which Windows may report differently than Linux does.

### 7c. Native module install (`better-sqlite3`)
If `npm install` in Phase 1 failed or showed errors mentioning `node-gyp`, `python`, or a C++ build toolchain:
- [ ] Note the exact error
- `better-sqlite3` ships prebuilt binaries for common Node/Windows combos, so this usually isn't needed, but if it tries to compile from source you may need Visual Studio Build Tools. Worth reporting the exact Node version + error rather than trying to fix it blind.

### 7d. Full service install (optional, do this last)
Once dev-mode testing above all passes, try the real production path:
```powershell
# From an elevated (Administrator) PowerShell prompt, from the repo root:
.\packaging\windows\install.ps1
```
- [ ] Completes without error (requires NSSM — `winget install NSSM.NSSM` first if you don't have it)
- [ ] `Start-Service netintel` works, `Get-Service netintel` shows it running
- [ ] Kill the process externally (Task Manager → End Task) to simulate a crash, confirm NSSM actually restarts it automatically

---

## Phase 8 — Anything that doesn't fit above

Just poke around. Things worth trying since they're inherently hard to predict without a real environment:
- A genuinely large network (many devices) — do the analytics functions that do full-table scans (several were noted as fine at seed-data scale but unprofiled at production scale) stay responsive?
- Let it run for a few real days so multi-day features (retention curves, seasonal pattern, weekly/monthly reports) have real history to show instead of "not enough data yet" notes
- Try the CLI's `export` command with a real dataset

---

## Phase 9 — What to send back

For anything that failed or looked wrong, this is the fastest format for me to act on:

1. **What you ran** (exact command or page)
2. **What you expected**
3. **What actually happened** — exact error text, or a screenshot/copy of the wrong-looking output
4. Your **Technitium version** (relevant for anything in Phase 3)
5. Whether it happened in **dev mode, the NSSM service, or both**

Phase 3's findings are the highest-value ones — those are the fields the code has been honestly guessing at or flatly refusing to guess at, and real evidence from your instance either confirms the current approach or tells us exactly what to fix.
