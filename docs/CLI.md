# netintel — CLI Reference

The `netintel` command-line tool talks to a running netintel server (`NETINTEL_API_URL`, default `http://localhost:8787`). It doesn't run the collector itself — start the server first (`npm run dev:server`, or the installed service).

```bash
cd packages/cli
npm run start -- <command> [args] [flags]
```

Or, once built and linked (see the packaging guides), just `netintel <command>`.

---

## Global flags

These apply to every command, not just specific ones.

| Flag | Effect |
|---|---|
| `--chart <style>` | Overrides the chart style for this run only. One of `line`, `sparkline`, `braille`. See [Chart styles](#chart-styles) below. |
| `--json` | Prints the raw fetched data as JSON instead of formatted tables/charts — for scripting and piping into `jq`. Every command supports this. `watch` emits one JSON object per line (NDJSON) instead of a single document. |
| `-V, --version` | Print the CLI version. |
| `-h, --help` | Help for the CLI, or `netintel <command> --help` for a specific command. |

---

## Commands

### `status`
Engine health: Technitium reachability, collector status, live device count, uptime, database size.

### `devices`
Live devices on the LAN, with idle detection, MAC vendor hints (best-effort, from a small offline OUI table), and query-rate percentile ranking.

### `domain <domain>`
Full drill-down for one domain: query stats, category, daily history (+ a trend chart), response code distribution, query burstiness (Fano factor), subdomain fragmentation, recent queries.

```bash
netintel domain example.com
netintel domain example.com --chart braille
netintel domain example.com --json
```

### `security`
NXDOMAIN analysis, high-entropy domains, newly-observed domains, behavioral anomaly baseline, suspicious TLD exposure, punycode/homograph detection, DNS tunneling heuristics (candidate signal, not a verdict), repeated failure bursts, blocklist hit attribution.

### `performance`
DNS/cache performance, prefetch candidates, upstream resolver comparison, network reliability, per-client latency, recursive-vs-cached ratio over time, retransmission rate, protocol feature usage. DNSSEC validation rate and response size distribution are reported as honestly unavailable — see [Known data gaps](#known-data-gaps).

### `protocol`
Query type distribution, IPv4 vs IPv6 mix, CNAME chain depth (**unconfirmed format** — see gaps below), reverse DNS (PTR) volume, malformed/REFUSED rate, DoH/DoT/DoQ bypass attempts.

### `dhcp`
Lease churn by day (with a trend chart), lease duration distribution, IP reuse/identity continuity, DHCP-to-DNS activity gap (devices that hold a lease but rarely resolve anything).

### `system`
Capacity forecasts (query volume, database size, device count — linear projection from real history), disk runout estimate, host resource utilization (CPU/memory, with the usual caveat that CPU load is unavailable on Windows), restart history, collector outage log.

### `report`
Weekly and monthly reports, personal internet fingerprint, category share momentum, seasonal pattern (actual vs. historical average by weekday), domain churn/retention, tool usage stats, storage footprint (real per-table sizes via SQLite's `dbstat`).

### `behavioral`
Search-vs-direct navigation split, most periodic domains (candidate background/telemetry traffic), background-vs-interactive traffic split, daily routine (peak/quiet hours, weekday-vs-weekend ratio, with an hourly activity chart), multi-device session overlap, recurring domain sequences.

### `explain [metricOrGroup]`
Explains any of the 100 metrics — same descriptions/formulas shown in the web dashboard's tooltips, sourced from the same registry as [`docs/METRICS.md`](./METRICS.md).

```bash
netintel explain                          # list all 100, grouped
netintel explain security                 # list just the security group
netintel explain dhcp_lease_churn         # full detail for one metric
```

### `config [key] [value]`
View or set persisted CLI preferences. Currently just chart style.

```bash
netintel config                           # show current settings
netintel config chart-style braille       # persist a default style
```

Stored at `~/.netintel/cli-config.json`.

### `notifications`
The categorized notification feed (same as the dashboard's bell icon) — new devices, security events, performance issues, insights.

### `watch`
Live streaming view over the server's WebSocket feed. `--json` mode emits newline-delimited JSON, one object per event — pipe into `jq` or a log aggregator.

```bash
netintel watch
netintel watch --json | jq 'select(.type == "notification")'
```

### `export`
Exports data at a chosen privacy level.

```bash
netintel export --level <1-4> [--format <format>] [--out <path>]
```

| `--level` | Meaning |
|---|---|
| `1` | Full — includes raw client IPs/MACs. Local use only. |
| `2` | Pseudonymized — device identifiers replaced with stable but non-reversible tokens. |
| `3` | Aggregated — no per-device rows, only rollups. |
| `4` | Anonymous research — safe to share; strips anything that could re-identify a device or household. |

`--format`: `json` (default), `csv`, `md`, `html`, `sqlite`, `parquet`, `pdf`. `sqlite` is only valid at `--level 1`, since a full relational export inherently carries level-1 detail.

---

## Chart styles

Three switchable rendering styles for every time-series chart in the CLI (distributions/rankings use a single horizontal bar-chart style — see below for why that one isn't switchable).

| Style | What it looks like | Best for |
|---|---|---|
| `line` | Full-height [asciichart](https://github.com/kroitor/asciichart) line plot with axis labels, multi-series legend | Default. Most readable for a single glance, especially multi-series data. |
| `sparkline` | Compact single-row block strip (`▁▂▃▄▅▆▇█`) per series | Narrow terminals, or when you want several charts' worth of trend visible at once without scrolling. |
| `braille` | Hand-rolled dot-matrix plot using Unicode braille characters | Roughly 2x the resolution of `sparkline` in the same terminal space — reads as an actual curve rather than a height-bar strip. Requires good terminal Unicode support (Windows Terminal recommended; legacy `cmd.exe`/older console hosts may render it incorrectly). |

Set a persistent default with `netintel config chart-style <style>`, or override per-invocation with `--chart <style>` on any command that has a chart.

Distribution/ranking data (query type breakdowns, top offenders, category shares) always renders as a horizontal block-bar chart — a single, deliberately non-switchable style, since a bar chart is already the clearest terminal-native fit for ranked categorical data.

---

## `--json` mode and scripting

Every command accepts `--json`, printing exactly the data it would otherwise format — same field names as the corresponding API endpoint.

```bash
# Alert if host memory is high, from a cron job
netintel system --json | jq -e '.hostUtil.memoryUsedPercent.mean > 90' && echo "high memory"

# Pull just the security section into a file for another tool to consume
netintel security --json > security-snapshot.json

# Stream live events into a log file
netintel watch --json >> netintel-events.ndjson
```

---

## Known data gaps

**If every command shows zero/no data, this section isn't your problem** — that's almost always the Query Logs (Sqlite) app not being installed/enabled in Technitium (see [`docs/SETUP.md`](SETUP.md), Part C). The gaps below are narrower: specific fields that stay unavailable even with everything else working correctly, because they haven't been confirmed present in a real Technitium API response yet (or are confirmed absent from the fields netintel currently reads):

- **DNSSEC validation rate** (`performance`) — not exposed by the query-log fields netintel reads.
- **Response payload size** (`performance`) — same.
- **EDNS0 usage / TC-bit (truncated response)** (`performance`) — same; protocol distribution itself (UDP/TCP/DoT/DoH/DoQ) *is* real data.
- **CNAME chain depth** (`protocol`) — depends on the raw `answer` field's format, which is a documented guess pending live-instance verification (see [`docs/METRICS.md`](./METRICS.md#protocol), metric #87).

If your Technitium instance's API docs show any of these are actually available and netintel just isn't reading the right field, that's a real, fixable gap worth reporting.
