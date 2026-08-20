# Personal Network Intelligence — v1 Bible

**Codename:** netintel
**Core principle:** *Your network generates data. You own it. Understand it. Export it.*
**Status:** Locked v1 scope — build from this document.

---

## 1. What This Is

A self-hosted DNS observability and intelligence platform for a home/LAN network. It sits on top of Technitium DNS Server, captures every DNS event on the network, and turns it into rich analytics, security insight, and internet-usage understanding — all local, all owned by the user, nothing ever leaves the LAN.

**Pitch:** *A self-hosted DNS observability and intelligence platform that learns how your network uses the internet.*

**Non-negotiables:**
- Runs entirely on the user's LAN. No cloud telemetry, no phone-home, no external analytics service, ever.
- Raw data is never discarded. Storage is cheap; insight potential is not.
- v1 tracks **live/currently-connected devices only**. Historical device tracking (devices that were once on the LAN but aren't now) is explicitly deferred to a future version.
- No feature is cut for compute/storage savings in v1. Every metric listed here ships.

---

## 2. High-Level Architecture

```
Internet
   │
Router/Firewall (DoH/DoT/DoQ egress blocking, port 53 NAT redirect)
   │
LAN / Wi-Fi
   │
   ├── Devices (clients)
   │
   └── netintel host (always-on: Pi / mini PC / NAS / Proxmox VM)
        │
        ├── Technitium DNS Server  →  DNS + DHCP + DNSSEC + upstream (Quad9/Cloudflare DoT/DoH) + blocking
        │        │
        │        ▼
        ├── Collector           →  reads Technitium query logs + DHCP events in real time
        │        │
        │        ▼
        ├── Device Identity Engine → resolves stable device_id from MAC/DHCP/hostname signals
        │        │
        │        ▼
        ├── SQLite (raw events + rollups + intelligence tables)
        │        │
        │        ▼
        ├── Analytics Engine    →  computes all 50 metrics, anomaly detection, categorization, relationships
        │        │
        │        ├── REST/WebSocket API (Bun/TS backend)
        │        ├── Web Dashboard (React/Vite/TanStack)
        │        ├── CLI (`netintel`)
        │        ├── Notification Engine
        │        └── Export Engine (multi-format, tiered privacy)
```

Technitium is the DNS/DHCP engine underneath — never replaced, never forked. netintel is the intelligence layer on top of it.

---

## 3. Core DNS Engine

**Choice: Technitium DNS Server**, confirmed as the right pick for this project specifically because it's the only self-hosted option that natively bundles a full DHCP server + full REST API + recursive/authoritative resolution + DNSSEC + DoH/DoT/DoQ upstream support in a single binary. AdGuard Home is more polished out of the box but weaker on DHCP/API depth; Pi-hole is ad-blocking-first with the thinnest API surface.

**Known trade-off (documented, not a blocker):** Technitium is single-maintainer and runs on .NET (heavier than Go/Rust alternatives). Acceptable for v1.

**Setup:**
- Router = `192.168.1.1` (stays as internet gateway)
- Technitium = fixed IP, e.g. `192.168.1.10`
- Phase 1: router keeps DHCP, advertises Technitium as DNS server 1, DNS server 2 left empty
- Phase 2 (later, optional): disable router DHCP, let Technitium serve DHCP + DNS for full identity-chain control
- Upstream: Technitium → Quad9 or Cloudflare via DoT/DoH (encrypted upstream)
- Technitium web UI stays LAN-only. Port 53 is never port-forwarded to WAN.
- Two-instance HA is a documented future option (`192.168.1.10` + `192.168.1.11`), analytics must aggregate both nodes when it happens — not v1.

**Resilience (locked in):**
1. **Fallback DNS instance** — netintel supports pointing DHCP at a secondary Technitium instance if the user sets one up. Optional, documented, not required.
2. **Auto-restart on crash** — netintel process-supervises the Technitium instance (or is supervised itself via systemd/Docker restart policy) and auto-restarts on crash or unexpected exit.
3. **Router-level fallback DNS** — documented guide for setting the router's secondary DNS to a public resolver (e.g. Cloudflare) as an internet-continuity safety net if the whole netintel box goes down. User's choice, not enforced.

---

## 4. Network Enforcement: DoH/DoT/DoQ Bypass Handling

This is router/firewall-layer work, shipped as a companion "network lockdown" guide + optional script — not a Technitium feature, not magic. Full bypass prevention against a determined user (private DoH server, VPN) is not achievable; this closes the default-behavior gap, which is ~95% of real-world leakage.

| Protocol | Port | Blockability | Action |
|---|---|---|---|
| DoT | TCP+UDP 853 | Easy — dedicated port, no other use | Block outbound 853 entirely at router/firewall. Zero side effects. |
| DoQ | UDP 853 (primary), UDP 443 (fallback) | Easy for primary, harder for fallback | Block UDP 853; optionally block UDP 443 to known resolver IP list |
| DoH | TCP 443 (shares with HTTPS) | Hard — indistinguishable from normal HTTPS by port | Maintain/consume a blocklist of known DoH resolver IPs/domains (Cloudflare, Google, Quad9, NextDNS, etc.); deny outbound 443 to that list |
| Firefox DoH canary | N/A | Trivial | Technitium returns NXDOMAIN for `use-application-dns.net` → Firefox auto-disables DoH. No firewall rule needed. |
| Hardcoded plain DNS (8.8.8.8 etc.) | UDP/TCP 53 | Easy | NAT-redirect all outbound port 53 traffic back to the Technitium instance |
| VPN | Any | Not solvable at DNS layer | Out of scope — documented as a known limitation, not something netintel claims to defeat |

This entire section ships as a **"Network Lockdown" setup module** — step-by-step for common router/firewall platforms (OPNsense/pfSense rules, consumer router equivalents where possible) plus an optional maintained DoH-IP blocklist the collector can ingest and keep current.

---

## 5. Device Identity System

**Problem:** dynamic IPs. **Solution:** device identity is never IP-based; IP is just current network state.

**Device record:**
- Stable identity: MAC address, DHCP client ID, hostname
- Current state: IP address (v4/v6), lease start/end
- IP history table: `device_id | ip | start | end`

**Identity confidence scoring** (used to re-associate a device across IP/MAC changes):
- MAC match: +50
- DHCP client ID match: +25
- Hostname match: +15
- IP continuity: +10

Above a threshold, signals are merged into one probable identity; below it, treated as a new device pending confirmation.

**v1 scope lock:** only devices currently active on the LAN are tracked and shown. Devices that were seen historically but are no longer present are **not** retained as device records in v1 — this whole "device lifecycle history" concept is explicitly deferred to a future version.

**MAC randomization:** acknowledged limitation. Most devices keep a stable randomized MAC per-network on modern OSes, which is sufficient for LAN-scoped identity in practice.

**Best path to full control:** making Technitium the DHCP server (not just DNS) gives the identity engine complete lease/hostname visibility. Documented as the recommended Phase 2 network setup.

---

## 6. Data Pipeline & Database Architecture

**Rule: log everything, discard nothing.** Storage cost is negligible (few KB/day per active client); discarded raw data can never be recovered for future formulas. All 50 metrics (and any future metric) are computed *from* raw events — raw is the permanent source of truth.

### 6.1 Raw DNS Event Fields
```
timestamp, client_id, client_ip, protocol, domain, query_type, query_class,
response_code, response_type, answers, answer_count, answer_ttl, cached,
recursive, blocked, authoritative, response_time, upstream, upstream_protocol,
server_instance
```

### 6.2 Derived/Enrichment Fields
```
normalized_domain, registered_domain, subdomain, tld,
hour/day/week/month bucket, session_id, device_id, category
```

### 6.3 Database Tiers
- **Level 1 — Raw/immutable events.** Never discarded, never modified.
- **Level 2 — Aggregates.** Hourly → daily rollups, computed incrementally from raw.
- **Level 3 — Intelligence.** Popularity scores, prefetch scores, anomaly scores, lifecycle states, clusters, predictions.

### 6.4 Core Tables (SQLite via libSQL/Drizzle)
```
dns_events        (id, timestamp, client_id, domain, query_type, rcode, response_type,
                    cached, blocked, recursive, latency, ttl, answers)
domains           (domain, first_seen, last_seen, query_count, unique_days)
domain_daily      (date, domain, queries, unique_clients, cache_hits, blocked,
                    nxdomain, avg_latency, p95_latency)
clients           (client_id, name, first_seen, last_seen)
client_daily      (date, client_id, queries, unique_domains, blocked, nxdomain,
                    cache_hit_rate)
domain_categories (domain, category, confidence, source)
domain_relationships (domain_a, domain_b, cooccurrence, conditional_probability)
insights          (timestamp, type, score, explanation)
devices           (device_id, mac, hostname, dhcp_client_id, current_ip, first_seen, last_seen)
device_ip_history (device_id, ip, start, end)
```

### 6.5 Retention & Downsampling Strategy
Since raw events are kept forever, query performance is protected by **never querying raw events live for dashboards/CLI** — everything user-facing reads from rollups:
- Raw events: append-only, kept forever, used only for (a) drill-down/audit views and (b) re-deriving new metrics/rollups retroactively.
- Hourly rollups: computed incrementally as events land.
- Daily rollups: computed from hourly rollups at day-close.
- Weekly/monthly rollups: computed from daily rollups.
- Dashboards, CLI, and reports query rollup tables exclusively — raw is never on the hot path once volume grows.
- No deletion policy, no forced downsampling of raw data, ever, in v1.

---

## 7. Full Metrics Catalog (v1 — All 50, Locked)

Every metric below ships with **its own description string** stored alongside it in the codebase, surfaced in both the web dashboard (info tooltip/expandable "What is this?" on every metric card) and the CLI (`netintel explain <metric>`). No metric ships silently — the user should always be able to ask "what does this mean" and get a real answer, in-product.

### Domain-Level Analytics
1. **Domain statistics** — query count, unique clients, first/last seen, queries per day/hour, time since last query, revisit intervals, mean/median/p25/p75/p95/min/max/stddev of query intervals.
2. **Domain popularity score** — `Popularity = w1·log(1+Q) + w2·R + w3·U + w4·F` where Q=query count, R=recency, U=unique days active, F=frequency regularity. Blends "how much," "how recently," and "how consistently" a domain is used into one score.
3. **Unique-domain statistics** — unique domains per day/week/month. Growth = `(Dt − Dt-1) / Dt-1`.
4. **Domain concentration** — top 1/5/10/50 domain share of total queries. Herfindahl-Hirschman Index `HHI = Σ pi²` measures how concentrated vs. spread out browsing is.
5. **Time-of-day behavior** — queries per hour, peak hour, peak period, quiet period. `ActivityRatio = active-hour queries / total queries`.
6. **Day-of-week behavior** — Monday–Sunday comparison of volume and category mix.
7. **Sessions** — approximated via inactivity gap (default 30 min). Sessions/day, avg/median session duration, longest session, queries/session, domains/session.
8. **Session diversity** — `Diversity = unique domains / total queries` within a session; how exploratory vs. repetitive a session was.
9. **Domain categories** — Search, Social, Entertainment, Streaming, News, Shopping, Finance, Banking, Education, Development, Cloud, Productivity, Communication, Gaming, AI, Advertising, Analytics, Telemetry, CDN, Security, Software Updates, OS. Tracked: queries, unique domains, time-of-day distribution, growth, concentration — per category.
10. **First-party vs. third-party activity** — first-party domains (the site you're visiting) vs. third-party (everything else it loads). `TPR = third-party queries / total queries`.
11. **Tracking footprint** — ad, analytics, fingerprinting, telemetry, social-tracking, marketing domains. Tracker queries/day, unique trackers/day, tracker percentage, top trackers, sites that trigger the most trackers.
12. **Block statistics** — total blocked, blocked/day/hour, unique blocked domains, blocked domains per client/category. `BlockRate = blocked queries / total queries × 100`.

### Security & Anomaly
13. **Security analytics** — NXDOMAIN, SERVFAIL, REFUSED, timeouts, blocked queries, suspicious domains, DGA-like domains, new domains, high-frequency unknown domains — tracked as a unified security surface.
14. **NXDOMAIN analysis** — `NXRate = NXDOMAIN / total queries`, tracked by day/hour/client/domain with spike detection.
15. **Domain entropy** — Shannon entropy `H(X) = −Σ p(x)·log2 p(x)` of domain character distribution, used as a *feature* for suspicious/algorithmically-generated domains, never as standalone proof.
16. **Newly observed domains** — first_seen/last_seen/query_count tracked per domain. New domains/day/week/month, never-before-seen domains, one-time domains, emerging domains.
17. **Domain lifecycle classification** — every domain classified as New, Emerging, Regular, Dormant, Returning, One-time, or Disappeared based on its query history shape.
30. **Behavioral anomaly detection** — baseline built from normal queries/hour, unique domains/hour, NXDOMAIN rate, tracker rate, category distribution; deviations from baseline flagged.
31. **Z-score anomaly detection** — `z = (x − μ) / σ` per metric stream. `|z| > 3` = candidate strong anomaly — explicitly surfaced as a *candidate*, never as proof of compromise.

### Performance
18. **DNS performance** — response, cache, recursive, and upstream latency; timeout/failure rate. Mean, median, p50/p90/p95/p99, max, stddev.
19. **Cache performance** — `CacheHitRate = cached queries / total eligible queries × 100`, tracked by day/hour/domain/client.
20. **Cache opportunity** — surfaces domains with high query frequency but low cache hit rate — the concrete list of "what caching would help most."
21. **TTL analytics** — average/median/min/max TTL and full distribution across all resolved domains.
22. **Intelligent prefetch score** — `PrefetchScore = Frequency × Recency × ExpiryProbability × LatencyBenefit`. Drives which domains get proactively refreshed before TTL expiry.
23. **DNS latency savings** — `LatencySaved = RecursiveQueries × (RecursiveLatency − CacheLatency)`. Explicitly labeled as *DNS-resolution latency saved*, never conflated with total page-load or browsing time saved.
24. **Upstream comparison** — Quad9/Cloudflare/Google/AdGuard compared live on latency, success rate, timeout rate, DNSSEC behavior, availability. `Score = w1·Latency + w2·Reliability + w3·Security`.
25. **Network reliability** — DNS failures, timeouts, SERVFAIL, upstream failures. `DNSAvailability = 1 − (failed queries / total queries)`.

### Device Analytics
26. **Device analytics** — per device: queries, unique domains, blocked, NXDOMAIN, category mix, peak hours, cache hit rate.
27. **Device behavioral fingerprint** — vector of domain diversity, category distribution, query rate, active hours, tracker ratio, blocked ratio, NXDOMAIN rate, avg session length — a per-device "shape of usage."
28. **Cross-device comparison** — devices compared side by side on queries, unique domains, trackers, NXDOMAIN, cache hit rate, etc.

### Trends & Ecosystem
29. **Internet activity trends** — total queries, unique domains, new domains, blocked domains, tracker queries, category usage, DNS latency, cache hit rate — tracked over weeks/months. `MoM = (current − previous) / previous × 100`.
32. **Entropy of browsing behavior** — `H = −Σ pi·log2(pi)` across category shares. Low entropy = concentrated/routine activity; high entropy = diverse/exploratory activity.
33. **Domain diversity index** — `D = unique domains / total queries`.
34. **Repeat ratio** — `RepeatRatio = 1 − (unique domains / total queries)` — how habitual vs. novel browsing is.
35. **Top-domain dependency** — top 1%/5%/10%/50% domain share and how dependent the network is on a small ecosystem.
36. **Ecosystem analysis** — domains grouped by parent ecosystem (Google, Microsoft, Apple, Amazon, Meta, Cloudflare, GitHub, OpenAI, etc.) with queries, unique domains, percentage share, and growth per ecosystem.
37. **Infrastructure dependency** — classification into CDN, cloud hosting, DNS, analytics, advertising, authentication, API, storage — measuring how reliant the network is on each infrastructure layer.

### Behavioral Inference
38. **Application detection** — DNS query patterns/signatures used to infer likely application activity. Always labeled explicitly as *inference*, never presented as ground truth.
39. **Search vs. direct-navigation browsing** — domain signals used to distinguish search-engine use, direct navigation, content platforms, social media. Explicitly caveated: DNS gives signals, not exact page-level history.
40. **Background vs. interactive traffic** — likely-background traffic identified via regularity, low session correlation, and periodic request patterns.
41. **Periodicity detection** — `CV = stddev / mean`, `Periodicity = 1 − CV`. Identifies telemetry heartbeats, background services, and monitoring traffic.
42. **Domain correlation** — for domains A and B, `P(B|A) = Sessions(A,B) / Sessions(A)`. Builds a domain relationship graph.
43. **Domain clusters** — co-occurrence-based discovery of domain groups/ecosystems the network actually uses together.
44. **Domain transition analysis** — models A → B → C sequences and computes `P(B|A)` to understand real navigation flow.
45. **Predictive DNS** — uses historical query relationships to anticipate likely next domains, strictly respecting TTL semantics — never inventing or pre-serving fabricated records.
46. **Internet routine detection** — recurring time/day patterns clustered into workday, weekend, holiday, high-activity, low-activity regimes.

### Reporting & Fingerprinting
47. **Weekly internet report** — total queries, unique domains, new domains, cache hit rate, blocked queries, tracker queries, peak activity, quietest period, avg/P95 latency, category distribution, week-over-week deltas — auto-generated.
48. **Personal internet fingerprint** — a single vector combining category shares, diversity, repeat ratio, tracker ratio, blocked ratio, peak hour, avg session length — the network's overall "signature," trackable over time.
49. **Database architecture** — (see Section 6) three-tier raw/aggregate/intelligence model, nothing ever discarded.
50. **Privacy principles** — local-only storage, no cloud telemetry, optional encrypted database, configurable retention, full data deletion on request, full export, anonymization tooling, per-device privacy controls.

---

## 8. Domain Categorization

**v1 approach: hybrid — manual, semi-automatic, and fully automatic, all supported together.**
- **Automatic base layer:** consume a maintained category/tracker feed (e.g. combined public blocklist + category taxonomy sources) as the default classifier for every domain on first sighting.
- **Semi-automatic:** system flags low-confidence classifications for user review/confirmation, building a growing set of user-confirmed mappings over time.
- **Manual override:** user can always explicitly recategorize any domain; manual assignments always win over automatic ones and are never overwritten silently.
- Every classification stores `(domain, category, confidence, source)` — source is always visible so the user knows if a label came from a feed, an inference, or their own hand.

---

## 9. Export System

**Principle:** *You own your network data. Export it however you choose.* netintel is not a data marketplace and will never build one — export is a personal-ownership feature, full stop. What a user does with their own exported data afterward is on them, same as owning any other personal dataset.

### 9.1 Formats
- **Machine-readable:** JSON, CSV, Parquet, SQLite (raw db copy)
- **Human-readable:** HTML, PDF, Markdown

### 9.2 Export Package Layout
```
export/
  raw/
    dns_events.parquet
  aggregated/
    daily_domains.csv
    device_stats.csv
    category_stats.csv
  analytics/
    trends.json
    anomalies.json
    relationships.json
  report.html
```

### 9.3 Privacy Tiers (user selects at export time)
- **Level 1 — Full:** exact timestamps, domains, device identifiers, IPs. Complete raw fidelity.
- **Level 2 — Pseudonymized:** domain/device identifiers transformed (hashed/tokenized), IP removed.
- **Level 3 — Aggregated:** category-level statistics only, no individual domain/device detail.
- **Level 4 — Anonymous research dataset:** hour/category/query-count/latency/cache-hit-rate only, no domain or device identity whatsoever — safe for sharing for research, benchmarking, or ML without exposing a browsing diary.

---

## 10. Notifications

Full notification system, categorized, surfaced in **both** the terminal and the web dashboard.

**Categories:**
- **Security** — anomaly detected, new suspicious domain, DGA-pattern spike, blocked-domain surge
- **Network** — new device joined LAN, device went offline, DNS instance down, fallback engaged
- **Performance** — latency spike, cache hit rate drop, upstream resolver degraded
- **Insights** — weekly report ready, new domain lifecycle transition, notable trend detected
- **System** — export completed, retention/rollup job status, config change applied

Each notification carries: category, severity (info/warning/critical), timestamp, explanation, and a link/command to drill into the relevant dashboard view or CLI query. Delivered live via WebSocket to the web UI and via `netintel notifications` / a live `netintel watch` stream in the terminal.

---

## 11. CLI Specification (`netintel`)

```
netintel status                 # engine health, live device count, uptime
netintel stats --today          # today's core metrics summary
netintel devices                # live devices on LAN with per-device summary
netintel domain <domain>        # full metric drill-down for one domain
netintel security               # security/anomaly surface
netintel report --week          # generate weekly report
netintel insight                # latest auto-generated insights
netintel explain <metric>       # prints the description/formula for any metric — every metric in Section 7 is queryable this way
netintel export --level <1-4> --format <json|csv|parquet|sqlite|html|pdf|md>
netintel notifications           # categorized notification feed
netintel watch                  # live streaming view (devices, notifications)
```

---

## 12. Web Dashboard Specification

**Sections:** Overview · Network · Domains · Security · Performance · History

- **Overview** — top-line health, live device count, request volume, error/block rate, latency, all with sparkline trends (Maple-style inline mini-charts).
- **Network** — live device list (identity-engine resolved), per-device fingerprint, cross-device comparison.
- **Domains** — full domain table (query count, category, popularity score, lifecycle state), drill-down per domain into every domain-level metric from Section 7.
- **Security** — anomaly feed, NXDOMAIN/entropy/DGA surface, block statistics, z-score flagged events.
- **Performance** — cache hit rate, TTL analytics, prefetch scoring, upstream comparison, latency percentiles.
- **History** — weekly/monthly reports, trend charts, internet fingerprint over time.

**Every metric card/chart includes an inline "What is this?" expandable** pulling the exact same description text as `netintel explain <metric>` — one shared description source in the codebase, rendered in both surfaces.

### Design System (adapted from maple.dev's visual language, self-hosted stack underneath)
- Near-black background (not pure black), dark theme only for v1
- Monospace typeface throughout, including headings — "terminal-grade tool" feel over generic SaaS look
- Thin icon-only left nav rail + breadcrumb-style top bar
- Status conveyed via color-coded badges only (green/orange/red) — color is never decorative elsewhere
- Dense, scannable data tables — no card-bloat
- Inline sparkline/mini-area charts embedded directly in table rows for at-a-glance trends
- Single accent color used sparingly, only for primary actions/active states

---

## 13. Confirmed Tech Stack

| Layer | Choice |
|---|---|
| Frontend framework | React + Vite + TanStack Router |
| Styling | Tailwind CSS + shared internal component library |
| Charts | Recharts (primary), visx (custom relationship/entropy visualizations) |
| Data fetching/state | TanStack Query |
| Backend API | Bun + TypeScript (Hono or Effect-HTTP) — single language across stack |
| Backend alternative (flagged, not v1-blocking) | Go, revisit if raw event throughput demands it |
| Database | SQLite via libSQL + Drizzle ORM |
| Realtime | WebSocket (native/`ws`) for live device + notification feed |
| CLI | Same Bun/TS codebase, compiled to a separate binary via `bun build --compile` |
| Auth | Local password/token, self-hosted only — no cloud auth provider |
| DNS/DHCP engine | Technitium DNS Server |

---

## 14. Licensing

Not finalized — two realistic options for a GitHub-facing self-hosted project:
- **MIT** — maximum adoption, simplest, most GitHub-friendly, no restriction on downstream use.
- **AGPL** — protects against someone SaaS-wrapping the project without contributing back, at the cost of being a heavier lift for casual contributors/adopters.

**Decision deferred to pre-launch**, does not block coding.

---

## 15. Roadmap

```
v0.1  Raw event collection (Technitium → collector → SQLite)
v0.2  Rollups + historical trend views
v0.3  Device identity engine + live device analytics
v0.4  Domain relationships + clustering
v0.5  Anomaly/security detection layer
v0.6  Intelligent prefetch scoring
v0.7  Notifications system (both surfaces)
v0.8  Export engine (all formats, all privacy tiers)
v0.9  Full CLI parity with dashboard
v1.0  Polished self-hosted network intelligence platform — all 50 metrics live,
      every metric explainable in-product, full docs, network-lockdown guide,
      packaged for <10-ish-step GitHub install
```

---

## 16. Explicitly Deferred (Not v1)

- Historical device tracking (devices no longer on the LAN)
- Multi-instance Technitium HA with cross-node aggregation
- Local AI-powered natural-language insights over the database
- Full VPN-proof DNS enforcement (acknowledged as unsolvable at the DNS layer)
- Any data-marketplace functionality (permanently out of scope, not just deferred)

---

*This document is the locked source of truth for v1. Every feature, metric, and formula listed here ships in full — no simplification, no compute-saving cuts. Build from this.*
