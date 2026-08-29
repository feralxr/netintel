# netintel — Full Setup Guide

This is the complete guide to getting netintel running on your network, including every fallback/resilience configuration option. If you just want the fastest path to trying it out, see the Quickstart in the main [`README.md`](../README.md) instead — come back here when you're ready to actually deploy it on your LAN.

**Supported platforms: Windows 10/11 and Linux.** No macOS support in v1.

---

## Table of contents

1. [Architecture recap](#1-architecture-recap)
2. [Choosing a network topology](#2-choosing-a-network-topology)
3. [Part A — Installing Technitium DNS Server](#part-a--installing-technitium-dns-server)
4. [Part B — Router DHCP configuration](#part-b--router-dhcp-configuration)
5. [Part C — Configuring Technitium](#part-c--configuring-technitium)
6. [Part D — Resilience & fallback configurations](#part-d--resilience--fallback-configurations)
7. [Part E — Installing netintel](#part-e--installing-netintel)
8. [Part F — Network lockdown (DoH/DoT/DoQ)](#part-f--network-lockdown-dohdotdoq)
9. [Part G — Verifying everything works](#part-g--verifying-everything-works)
10. [Part H — Troubleshooting](#part-h--troubleshooting)
11. [Part I — Uninstall / reset](#part-i--uninstall--reset)

---

## 1. Architecture recap

```
Internet
   |
Router/Firewall  <-- your existing router, mostly unchanged
   |
LAN / Wi-Fi
   |
   +-- Devices (phones, laptops, TVs, IoT...)
   |
   +-- Technitium DNS Server  <-- new: does DNS resolution + optional DHCP + blocking
   |        |
   |        v
   +-- netintel  <-- new: reads Technitium's data, computes analytics, serves the dashboard
```

Two separate pieces of software go on your network:

- **Technitium DNS Server** — the actual DNS resolver. This is what your devices talk to.
- **netintel** — sits alongside Technitium (can be the same machine or a different one on the LAN), polls it for query logs and DHCP leases, and turns that into the dashboard/CLI/analytics.

Neither needs to be internet-facing. Nothing here needs port-forwarding on your router.

---

## 2. Choosing a network topology

Before installing anything, decide which of these you're building. You can start simple and upgrade later — nothing here is a one-way door.

| Topology | What it is | Who it's for |
|---|---|---|
| **A. Single instance, DHCP unchanged** | One Technitium box. Router keeps doing DHCP, just tells devices to use Technitium for DNS. | Simplest. Start here. |
| **B. Single instance + router fallback to public DNS** | Same as A, plus your router has a secondary DNS server (e.g. `1.1.1.1`) configured as a safety net if Technitium goes down. | Recommended for most people — cheap insurance, small visibility tradeoff (see below). |
| **C. Single instance, Technitium also runs DHCP** | Technitium takes over DHCP from the router, giving netintel's device-identity engine full lease/hostname visibility. | Recommended once you're comfortable with topology A/B — better device tracking. |
| **D. Two Technitium instances (primary + secondary)** | A second Technitium box as a real DNS failover, both handed out via DHCP. | For people who don't want *any* DNS downtime, ever. Has a real tradeoff for netintel visibility — read the note in Part D before choosing this. |

**Recommended path for most people:** start at A, move to B within the first day, consider C after a week of stable operation, only reach for D if DNS uptime is genuinely critical for you (e.g. running other self-hosted services that depend on local DNS).

---

## Part A — Installing Technitium DNS Server

Technitium is a separate project from netintel — this section is a summary of what you need for netintel to work; see [technitium.com/dns](https://technitium.com/dns/) for their full docs.

### Choosing where it runs

Any always-on machine on your LAN: a Raspberry Pi, a mini PC, a NAS, a Proxmox/VM, or the same machine netintel will run on (totally fine to co-locate them — that's the default assumption in this guide). Give it a **static IP** — everything downstream depends on this not changing. Example used throughout this guide: `192.168.1.10`.

### Windows install

1. Download the Windows installer from [technitium.com/dns](https://technitium.com/dns/).
2. Run it — it installs as a Windows service (auto-starts, survives reboots).
3. Set a static IP for this machine via Windows network settings, or a static DHCP reservation on your router.
4. Open `http://<this-machine-ip>:5380` in a browser to reach the Technitium web UI.

### Linux install

```bash
curl -sSL https://download.technitium.com/dns/install.sh | sudo bash
```

This installs Technitium as a systemd service. Set a static IP via your distro's networking config or a DHCP reservation on your router, then reach the web UI at `http://<this-machine-ip>:5380`.

### First-run setup

On first web UI visit, Technitium walks you through creating an admin account and picking upstream resolvers. Recommended: **Quad9** (`9.9.9.9`, privacy/security-focused, blocks known-malicious domains at the resolver level) or **Cloudflare** (`1.1.1.1`, fastest in most regions) — configure it to use **DoT or DoH to that upstream** so your own outbound queries are encrypted too. This is separate from the DoH/DoT *blocking* you'll do later in Part F — that's about stopping other devices from bypassing Technitium, this is about Technitium's own upstream being encrypted.

---

## Part B — Router DHCP configuration

This is topology A/B (router keeps DHCP). If you're going straight to topology C (Technitium as DHCP), skip to the note at the end of this section instead.

1. Log into your router's admin page (commonly `192.168.1.1`).
2. Find the DHCP settings (often under "LAN," "Network," or "DHCP Server").
3. Set **Primary DNS Server** to your Technitium IP (e.g. `192.168.1.10`).
4. **Secondary DNS Server:**
   - **Topology A:** leave blank, or set it to the same Technitium IP.
   - **Topology B:** set it to a public resolver, e.g. `1.1.1.1` or `8.8.8.8` — see the fallback discussion in Part D for the tradeoff this creates.
5. Save and reboot the router (many routers require this for DHCP changes to take effect), or wait for existing device leases to renew (can take up to 24h+ depending on lease time — reboot devices individually to force it sooner).

### If you're going straight to topology C instead

Don't configure DHCP on the router at all — you'll disable the router's DHCP server entirely and let Technitium serve DHCP instead. See the topology C section in Part D for the full walkthrough; do that *instead of* this section, not in addition to it.

---

## Part C — Configuring Technitium

A few settings specifically worth setting before moving on:

### Query Logs (Sqlite) app — **required, netintel will not function without this**

**Administration → Apps → App Store** (or **Apps** in older Technitium versions) → find **"Query Logs (Sqlite)"** → **Install**.

This isn't optional and isn't just "more accurate metrics" — netintel's collector calls Technitium's `/api/logs/query` endpoint with `classPath: QueryLogsSqlite.App` on every single poll cycle, hardcoded. Without this app installed and enabled, that call fails and the collector has no query data at all — not "some metrics show no data," but netintel effectively does nothing.

If it's already installed, open it once from **Apps** and confirm it's **Enabled**. There's no additional configuration needed beyond that — Technitium logs to it automatically once it's active.

### API token (required for netintel)

**Administration → Sessions → Create Token.** Give it a name like `netintel`, copy the token somewhere safe — you'll need it for netintel's `NETINTEL_TECHNITIUM_TOKEN` environment variable. This token doesn't expire by default; you can revoke it later from the same screen if needed.

### Firefox DoH canary (do this now, it's free — see Part F for why)

**Zones → Add Zone** → type `Primary`, name `use-application-dns.net` → leave it with no valid A/AAAA record (or explicitly configure it to return NXDOMAIN). This makes Firefox automatically disable its own built-in DoH, which would otherwise bypass Technitium entirely.

### Blocking (optional but recommended)

**Settings → Blocking** → enable, and add one or more blocklist URLs (community-maintained ad/tracker blocklists — search "Technitium blocklist" for current recommendations, these change over time). This feeds directly into netintel's block-rate metrics (#12).

---

## Part D — Resilience & fallback configurations

This is the part you specifically asked about — here's every option, with the real tradeoffs for each.

### Option 1 — Router secondary DNS to a public resolver (topology B)

**What it is:** router's secondary DNS field set to `1.1.1.1`, `8.8.8.8`, or similar (see Part B).

**What it protects against:** if the Technitium machine crashes, loses power, or its disk fills up, devices don't lose internet access entirely — most OSes fall back to the secondary DNS server after the primary times out.

**The tradeoff:** while the fallback is active, **netintel sees nothing** — those queries go straight to the public resolver, bypassing Technitium and therefore bypassing netintel's collector entirely. This is usually fine (it's meant to be a rare-emergency fallback, not a normal operating mode), but if you notice a mysterious gap in your dashboard data, this is the first thing to check — it likely means Technitium was down for that window.

**How to set it up:** see Part B, step 4. That's it — no netintel-side configuration needed, this is purely a router setting.

### Option 2 — Two Technitium instances (topology D)

**What it is:** a second Technitium install (e.g. `192.168.1.11`) with the same upstream/blocking config as your primary, handed out as the router's secondary DNS server instead of a public resolver.

**Setup:**
1. Install Technitium on a second machine following Part A.
2. Configure it identically to your primary (same upstream resolvers, same blocklists) — Technitium doesn't sync config between instances automatically in v1, so replicate settings by hand, or export/import config from **Administration → Backup/Restore** if both instances are on a compatible Technitium version.
3. Router: Primary DNS = `192.168.1.10` (your primary), Secondary DNS = `192.168.1.11` (your fallback instance).

**The netintel tradeoff — read this carefully:** netintel's collector points at **one** Technitium instance (`NETINTEL_TECHNITIUM_URL`). If you fail over to the secondary instance, netintel keeps polling the primary and simply sees no new traffic until the primary comes back — it does **not** automatically follow the failover or aggregate both instances. True multi-node aggregation isn't implemented yet.

Practical options if you want real visibility during a failover with today's netintel:
- Manually update `NETINTEL_TECHNITIUM_URL` in `.env` to point at whichever instance is currently active, and restart netintel — a real but manual step.
- Accept the blind window during failover (usually short) as a known limitation, same as Option 1's tradeoff.
- If you're comfortable scripting, a small watchdog that pings both Technitium instances and rewrites netintel's environment config + restarts the service is a reasonable DIY bridge until real multi-node support ships.

### Option 3 — netintel auto-restart on crash

Already built in, not something you need to configure beyond following the packaging install guides:
- **Linux:** the systemd service (`packaging/linux/netintel.service`) has `Restart=on-failure`.
- **Windows:** the NSSM service install (`packaging/windows/install.ps1`) sets `AppExit Default Restart`.

This protects against netintel's own process crashing — it does not protect against Technitium going down (that's Options 1/2 above) or the underlying machine losing power (put both on a UPS if that matters to you).

### Option 4 — Technitium's built-in forwarder health checks

Independent of netintel entirely: Technitium itself can be configured with multiple upstream forwarders and will skip an upstream that's failing health checks (**Settings → DNS → Forwarders**). This is about Technitium's *upstream* resolution reliability (talking to the internet), not about your devices' path *to* Technitium — it doesn't replace Options 1/2 above, it's a different layer of the same general "don't have a single point of failure" goal.

### Recommended combination

For most home setups: **Option 1 (router fallback to a public resolver) + Option 3 (auto-restart service)**. This gets you real internet-continuity insurance with a documented, acceptable visibility tradeoff, and doesn't require maintaining a second DNS server. Move to Option 2 only if DNS uptime is genuinely critical to you.

---

## Part E — Installing netintel

Full details are in the main [`README.md`](../README.md) and the platform-specific packaging guides — summarized here for completeness:

```bash
git clone <this-repo>
cd netintel
npm install
npm run build
```

Set up your config:

```bash
cd packages/server
cp .env.example .env
```

Edit `.env` and set (at minimum):

```
NETINTEL_TECHNITIUM_URL=http://192.168.1.10:5380
NETINTEL_TECHNITIUM_TOKEN=<the token from Part C>
```

Then either run it directly for testing (`npm run dev:server` / `npm run dev:web` from the repo root), or install it as a proper service — both install scripts create this `.env` file for you automatically (pre-filled with the data directory), you just need to fill in the two Technitium values afterward:
- **Linux:** [`packaging/linux/README.md`](../packaging/linux/README.md)
- **Windows:** [`packaging/windows/README.md`](../packaging/windows/README.md)

---

## Part F — Network lockdown (DoH/DoT/DoQ)

Once Technitium and netintel are both running, the last step is making sure devices can't silently bypass Technitium via encrypted DNS. Full instructions with copy-pasteable firewall commands for Linux (nftables/iptables), Windows, and OPNsense/pfSense are in [`docs/NETWORK_LOCKDOWN.md`](NETWORK_LOCKDOWN.md) — do this after confirming the basic setup works (Part G), since firewall changes are easier to debug against a known-working baseline.

---

## Part G — Verifying everything works

Checklist, roughly in order:

1. **Technitium is reachable:** `http://<technitium-ip>:5380` loads in a browser.
2. **A device gets Technitium as its DNS server:** on a client device, check its network settings (or run `ipconfig /all` on Windows / `resolvctl status` or `cat /etc/resolv.conf` on Linux) — DNS server should show your Technitium IP.
3. **DNS actually resolves through it:** `nslookup google.com <technitium-ip>` from any device should return a real answer.
4. **Query Logs (Sqlite) app is installed and enabled:** Technitium web UI → **Administration → Apps** → confirm "Query Logs (Sqlite)" shows as installed/enabled. This is the one netintel actually depends on — see Part C. Don't skip this even if step 5 below shows entries; Technitium's built-in Query Logs *viewer* and the Sqlite app backing it are related but distinct, and it's the app specifically that netintel's collector calls.
5. **Technitium is logging queries:** in the Technitium web UI, **Query Logs**, you should see entries as you browse from any device.
6. **netintel is reachable:** `netintel status` should show `Technitium reachable: yes`. As of the health-check fix, this genuinely confirms the Query Logs app is working too — not just that Technitium's session API is up (see the breakdown below `Technitium reachable` in `netintel status` output: `session check`, `query logs`, `dhcp leases` are tracked and reported separately, precisely so this can't be ambiguous).
7. **netintel is actually collecting query data:** browse from a device, wait ~10s (default poll interval), then run `netintel devices` — the device you just used should show up with a nonzero query count, and the Overview dashboard page should show non-zero query counts too. This is the step that actually confirms step 4 succeeded. If devices show but query counts stay at zero, go back to step 4.
8. **Notifications work:** connecting a new device to the LAN should produce a "New device joined the network" notification within a minute (`netintel notifications` or the dashboard bell).

If any step fails, jump to Part H.

---

## Part H — Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Devices don't use Technitium at all | DHCP change hasn't propagated | Reboot the router, or manually renew DHCP lease on the device (`ipconfig /release && ipconfig /renew` on Windows, reconnect Wi-Fi on phones) |
| `netintel status` shows `Technitium reachable: no` | Wrong URL/token, or Technitium not running | Double check `NETINTEL_TECHNITIUM_URL` (must include `http://` and the port, e.g. `http://192.168.1.10:5380`), confirm the token wasn't revoked, confirm Technitium's service is actually running |
| `netintel status` shows `Technitium reachable: no` with `query logs: failed` | **Query Logs (Sqlite) app isn't installed/enabled** — this is the single most common setup gap. `netintel status` tracks the session check, query logs, and DHCP leases as three separate signals precisely so this is unambiguous — if `session check: ok` but `query logs: failed`, that's this exact problem | Technitium web UI → **Administration → Apps** → install/enable "Query Logs (Sqlite)" (see Part C). No other config is needed once it's active — give it ~10s after enabling for the next poll cycle |
| netintel shows devices but zero query activity | Collector polling interval hasn't fired yet, or Technitium's query logging is disabled | Wait ~10s (default poll interval); in Technitium, confirm **Settings → Logging → Enable Query Logging** is on, and confirm the Query Logs (Sqlite) app is enabled (see row above) |
| Dashboard loads but shows nothing / connection errors in browser console | Frontend isn't reaching the API — proxy misconfigured | If running dev servers, confirm `apps/web/vite.config.ts`'s proxy target matches your API port; in production, confirm your reverse proxy config (see the packaging READMEs) routes `/api` and `/ws` correctly |
| A device's traffic never shows up in netintel at all | It's using an encrypted DNS path that bypasses Technitium (browser-builtin DoH, a VPN, etc.) | See Part F — this is exactly what network lockdown addresses. For VPN traffic specifically, see the honesty note at the bottom of `NETWORK_LOCKDOWN.md` — that one genuinely can't be fixed at the DNS layer |
| Notifications aren't showing up in the dashboard live | WebSocket not connecting | Check the "live"/"connecting" badge in the dashboard's top bar; if stuck on "connecting," confirm your reverse proxy is passing through WebSocket upgrade headers (see the nginx example in the Linux packaging README) |
| TTL / upstream comparison / CNAME depth metrics show "no data" | These specific fields' exact format is still unconfirmed against a live Technitium API response | Not a misconfiguration on your end — see [`docs/CLI.md`](CLI.md#known-data-gaps) for the current list. Note DNS latency itself (`responseRtt`) *is* confirmed working against a live v13+ instance running the Query Logs (Sqlite) app — if that specific one shows no data, check your Technitium version/app first. |

---

## Part I — Uninstall / reset

### Remove netintel only (keep Technitium)

See the "Uninstall" section of the relevant packaging README ([Linux](../packaging/linux/README.md) / [Windows](../packaging/windows/README.md)).

### Remove Technitium too

Follow Technitium's own uninstall instructions (uninstaller on Windows; on Linux, their install script has a corresponding removal process — check [technitium.com/dns](https://technitium.com/dns/) for current instructions). Then revert your router's DHCP DNS settings back to whatever they were before (usually just the router itself, or blank to use the ISP's default).

### Wipe netintel's data but keep it installed

Stop the service, delete the database file (`NETINTEL_DATA_DIR`'s `netintel.db`, `.db-wal`, `.db-shm`), run migrations again (`npm run db:migrate` from `packages/server`), restart. There's no partial-wipe/retention-window feature yet — it's all-or-nothing.
