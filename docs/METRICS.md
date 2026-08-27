# netintel — Metrics Reference

All 100 metrics netintel computes, grouped exactly as they appear in the CLI (`netintel explain`) and web dashboard. This file is generated directly from `packages/shared/src/metrics-registry.ts` — the single source of truth every layer (analytics functions, API routes, web tooltips, CLI `explain`) reads from, so it can never drift out of sync with what the product actually computes.

For any metric: `netintel explain <id>` in the CLI, or hover the (i) icon next to it in the web dashboard, shows the same description shown here.

Regenerate this file with `npm run docs:metrics` after any registry change — don't hand-edit it.

## Groups

- [Domain](#domain) (17)
- [Security](#security) (14)
- [Performance](#performance) (14)
- [Device](#device) (8)
- [Trends](#trends) (11)
- [Behavioral](#behavioral) (13)
- [Reporting](#reporting) (7)
- [Protocol](#protocol) (6)
- [DHCP](#dhcp) (4)
- [Capacity](#capacity) (3)
- [Infrastructure](#infrastructure) (3)

---

## Domain

### #1 — Domain Statistics

Per-domain query count, unique clients, first/last seen, queries per day/hour, time since last query, and the full distribution (mean/median/p25/p75/p95/min/max/stddev) of revisit intervals.

`id: domain_statistics`

### #2 — Domain Popularity Score

A blended score of how much, how recently, and how consistently a domain is used.

```
Popularity = w1*log(1+Q) + w2*R + w3*U + w4*F  (Q=query count, R=recency, U=unique active days, F=frequency regularity)
```

`id: domain_popularity_score`

### #3 — Unique Domain Statistics

Count of distinct domains queried per day/week/month, and their growth rate over time.

```
Growth = (D_t - D_t-1) / D_t-1
```

`id: unique_domain_statistics`

### #4 — Domain Concentration

How concentrated vs. spread out browsing is: share of total queries held by the top 1/5/10/50 domains, summarized by the Herfindahl-Hirschman Index.

```
HHI = sum(p_i^2)
```

`id: domain_concentration`

### #5 — Time-of-Day Behavior

Query volume by hour, including peak hour, peak period, and quiet period.

```
ActivityRatio = active-hour queries / total queries
```

`id: time_of_day_behavior`

### #6 — Day-of-Week Behavior

Compares query volume and category mix across Monday through Sunday.

`id: day_of_week_behavior`

### #7 — Sessions

Browsing sessions approximated via an inactivity gap (default 30 min): sessions per day, average/median duration, longest session, queries per session, domains per session.

`id: sessions`

### #8 — Session Diversity

How exploratory vs. repetitive a session was.

```
Diversity = unique domains in session / total queries in session
```

`id: session_diversity`

### #9 — Domain Categories

Query volume, unique domains, time-of-day distribution, growth, and concentration broken down per category (Search, Social, Entertainment, Streaming, News, Shopping, Finance, Banking, Education, Development, Cloud, Productivity, Communication, Gaming, AI, Advertising, Analytics, Telemetry, CDN, Security, Software Updates, OS).

`id: domain_categories`

### #10 — First-Party vs. Third-Party Activity

Distinguishes domains you directly visited from domains loaded incidentally by those sites.

```
TPR = third-party queries / total queries
```

`id: first_party_vs_third_party`

### #11 — Tracking Footprint

Ad, analytics, fingerprinting, telemetry, social-tracking, and marketing domain activity: trackers per day, unique trackers, tracker percentage, top trackers, and which sites trigger the most trackers.

`id: tracking_footprint`

### #12 — Block Statistics

Total and per-day/hour blocked queries, unique blocked domains, and blocked domains broken down by client and category.

```
BlockRate = blocked queries / total queries * 100
```

`id: block_statistics`

### #51 — Domain Response Code Distribution

NOERROR/NXDOMAIN/SERVFAIL/REFUSED/timeout mix, per domain and network-wide.

`id: domain_response_code_distribution`

### #52 — Domain Co-Visit Recency

For domains already known to be paired (via #42), the time-lag between their two most recent visits — how in-sync a pair's usage still is right now.

`id: domain_co_visit_recency`

### #53 — Domain Query Burstiness

How bursty vs. evenly-spaced a domain's queries are.

```
Fano = variance(inter-query gaps) / mean(inter-query gaps)
```

`id: domain_query_burstiness`

### #54 — Subdomain Fragmentation

Count of distinct subdomains generated under a base domain — a proxy for CDN sharding or dynamic tracker subdomains.

`id: subdomain_fragmentation`

### #55 — Domain Recency Decay Score

An exponentially-weighted recency score for fading domains out of 'active' views without deleting their history.

```
DecayScore = e^(-λ * days_since_last_seen)
```

`id: domain_recency_decay_score`

---

## Security

### #13 — Security Analytics

Unified security surface combining NXDOMAIN, SERVFAIL, REFUSED, timeouts, blocked queries, suspicious domains, DGA-like domains, new domains, and high-frequency unknown domains.

`id: security_analytics`

### #14 — NXDOMAIN Analysis

Rate of non-existent-domain responses, tracked by day/hour/client/domain with spike detection.

```
NXRate = NXDOMAIN responses / total queries
```

`id: nxdomain_analysis`

### #15 — Domain Entropy

Shannon entropy of a domain's character distribution, used as one feature (never standalone proof) for spotting suspicious or algorithmically-generated domains.

```
H(X) = -sum(p(x) * log2(p(x)))
```

`id: domain_entropy`

### #16 — Newly Observed Domains

New domains per day/week/month, never-before-seen domains, one-time domains, and emerging domains, based on tracked first_seen/last_seen/query_count.

`id: newly_observed_domains`

### #17 — Domain Lifecycle Classification

Classifies every domain as New, Emerging, Regular, Dormant, Returning, One-time, or Disappeared based on the shape of its query history.

`id: domain_lifecycle_classification`

### #30 — Behavioral Anomaly Detection

Compares live queries/hour, unique domains/hour, NXDOMAIN rate, tracker rate, and category distribution against a learned baseline, flagging deviations.

`id: behavioral_anomaly_detection`

### #31 — Z-Score Anomaly Detection

Statistical outlier detection per metric stream. Surfaced as a candidate anomaly, never as proof of compromise.

```
z = (x - mean) / stddev ; |z| > 3 is flagged as a candidate strong anomaly
```

`id: zscore_anomaly_detection`

### #56 — Suspicious TLD Exposure

Query share to TLDs statistically associated with abuse, tracked as a trend only — never used as a block signal on its own.

`id: suspicious_tld_exposure`

### #57 — Punycode / Homograph Domain Detection

Flags domains using punycode (xn--) or mixed-script characters, a common phishing/homograph-attack technique.

`id: punycode_homograph_detection`

### #58 — DNS Tunneling Heuristics

Candidate signal combining high query rate, long query labels, and high character entropy for one domain — never a verdict on its own.

`id: dns_tunneling_heuristics`

### #59 — Repeated Failure Burst Detection

Clusters of NXDOMAIN/SERVFAIL from the same client in a short window — can indicate malware C2 domain-generation attempts, or just a misconfigured device.

`id: repeated_failure_burst_detection`

### #60 — Blocklist Hit Attribution

Which category triggered each block, and per-category effectiveness over time. Attributed by netintel's own domain category, not by upstream blocklist name.

`id: blocklist_hit_attribution`

### #61 — New Device Security Baseline

Snapshots a newly-seen device's first-24h query pattern as the initial baseline that #30's anomaly detection compares later activity against.

`id: new_device_security_baseline`

### #62 — Alert-to-Incident Correlation

Links a fired alert policy back to the underlying security-analytics signals recorded near the same timestamp, for post-hoc review.

`id: alert_to_incident_correlation`

---

## Performance

### #18 — DNS Performance

Response, cache, recursive, and upstream latency plus timeout/failure rate, summarized as mean, median, p50/p90/p95/p99, max, and stddev.

`id: dns_performance`

### #19 — Cache Performance

Share of eligible queries served from cache, tracked by day/hour/domain/client.

```
CacheHitRate = cached queries / total eligible queries * 100
```

`id: cache_performance`

### #20 — Cache Opportunity

Domains with high query frequency but low cache hit rate — the concrete list of where caching would help most.

`id: cache_opportunity`

### #21 — TTL Analytics

Average/median/min/max TTL and the full TTL distribution across all resolved domains.

`id: ttl_analytics`

### #22 — Intelligent Prefetch Score

Drives which domains get proactively refreshed before TTL expiry.

```
PrefetchScore = Frequency * Recency * ExpiryProbability * LatencyBenefit
```

`id: intelligent_prefetch_score`

### #23 — DNS Latency Savings

DNS-resolution latency saved by caching. Explicitly scoped to DNS resolution only — never conflated with total page-load or browsing time saved.

```
LatencySaved = RecursiveQueries * (RecursiveLatency - CacheLatency)
```

`id: dns_latency_savings`

### #24 — Upstream Comparison

Live comparison of configured upstream resolvers (e.g. Quad9, Cloudflare, Google, AdGuard) on latency, success rate, timeout rate, DNSSEC behavior, and availability.

```
Score = w1*Latency + w2*Reliability + w3*Security
```

`id: upstream_comparison`

### #25 — Network Reliability

Overall DNS availability based on failures, timeouts, SERVFAIL, and upstream failures.

```
DNSAvailability = 1 - (failed queries / total queries)
```

`id: network_reliability`

### #63 — Per-Client Latency Breakdown

Response-time distribution scoped per device rather than network-wide, to spot a single slow/misbehaving client.

`id: per_client_latency_breakdown`

### #64 — Recursive vs Cached Ratio Over Time

Daily trend of the recursive/cache split — an early signal for cache tuning or TTL misconfiguration.

`id: recursive_vs_cached_ratio_over_time`

### #65 — Query Retransmission Rate

Share of queries that look retried shortly after a prior query for the same client+domain — a proxy for resolver/network instability from query-log timing alone.

`id: query_retransmission_rate`

### #66 — DNSSEC Validation Rate

Share of validated vs. unvalidated vs. bogus DNSSEC responses. Not currently exposed by the fields netintel reads from Technitium's query log — reported honestly as unavailable.

`id: dnssec_validation_rate`

### #67 — EDNS/Protocol Feature Usage

Real protocol distribution (UDP/TCP/DoT/DoH/DoQ) and TCP-fallback share. EDNS0 usage and truncated (TC-bit) response detection aren't exposed by the collector yet.

`id: edns_protocol_feature_usage`

### #68 — Response Size Distribution

DNS response payload size distribution. Not currently exposed by the fields netintel reads from Technitium's query log — reported honestly as unavailable.

`id: response_size_distribution`

---

## Device

### #26 — Device Analytics

Per-device queries, unique domains, blocked count, NXDOMAIN count, category mix, peak hours, and cache hit rate.

`id: device_analytics`

### #27 — Device Behavioral Fingerprint

A per-device 'shape of usage' vector: domain diversity, category distribution, query rate, active hours, tracker ratio, blocked ratio, NXDOMAIN rate, and average session length.

`id: device_behavioral_fingerprint`

### #28 — Cross-Device Comparison

Side-by-side comparison of all live devices on queries, unique domains, trackers, NXDOMAIN rate, cache hit rate, and more.

`id: cross_device_comparison`

### #69 — Device Onboarding Timeline

A chronological view of a device's lifecycle: first-seen, first-classified-category, first-flagged-event, and current status.

`id: device_onboarding_timeline`

### #70 — Device Idle Detection

Identifies devices with DNS history but no meaningful recent activity — asleep or idle networked hardware rather than genuinely gone.

`id: device_idle_detection`

### #71 — Device Category Affinity Shift

Compares a device's dominant category mix this week against last week, to surface a device's usage character drifting over time.

`id: device_category_affinity_shift`

### #72 — MAC Vendor / OUI Classification

Best-effort device-type hint from the DHCP-reported MAC vendor prefix, against a small offline table. A hint, never a guarantee — MACs can be randomized.

`id: mac_vendor_oui_classification`

### #73 — Device Query Rate Percentile Rank

Ranks each device against every other active device by query volume — spot the loudest clients on the network at a glance.

`id: device_query_rate_percentile_rank`

---

## Trends

### #29 — Internet Activity Trends

Total queries, unique domains, new domains, blocked domains, tracker queries, category usage, DNS latency, and cache hit rate, tracked over weeks/months.

```
MoM = (current - previous) / previous * 100
```

`id: internet_activity_trends`

### #32 — Entropy of Browsing Behavior

Low entropy means concentrated/routine activity; high entropy means diverse/exploratory activity across categories.

```
H = -sum(p_i * log2(p_i)) across category shares
```

`id: entropy_of_browsing_behavior`

### #33 — Domain Diversity Index

How varied domain usage is relative to total query volume.

```
D = unique domains / total queries
```

`id: domain_diversity_index`

### #34 — Repeat Ratio

How habitual vs. novel browsing is.

```
RepeatRatio = 1 - (unique domains / total queries)
```

`id: repeat_ratio`

### #35 — Top-Domain Dependency

Share of all queries held by the top 1%/5%/10%/50% of domains — how dependent the network is on a small set of destinations.

`id: top_domain_dependency`

### #36 — Ecosystem Analysis

Domains grouped by parent ecosystem (Google, Microsoft, Apple, Amazon, Meta, Cloudflare, GitHub, OpenAI, etc.) with queries, unique domains, share, and growth per ecosystem.

`id: ecosystem_analysis`

### #37 — Infrastructure Dependency

How reliant the network is on each infrastructure layer: CDN, cloud hosting, DNS, analytics, advertising, authentication, API, and storage.

`id: infrastructure_dependency`

### #74 — Category Share Momentum

Week-over-week rate of change (not just level) of each category's share of total queries — surfaces categories rising or falling fastest.

`id: category_share_momentum`

### #75 — Seasonal Pattern Detection

Compares current daily query volume against the same weekday in prior weeks, to separate a genuine trend from routine weekly cycles.

`id: seasonal_pattern_detection`

### #76 — Domain Churn Rate

Share of the network's active domain set that changed between periods.

```
Churn = (dropped + added) / total_domains_either_period
```

`id: domain_churn_rate`

### #77 — Long-Term Retention Curve

Cohort-style: of domains first seen N days ago (1/7/14/30/60/90-day buckets), what share are still queried today.

`id: long_term_retention_curve`

---

## Behavioral

### #38 — Application Detection

Infers likely application activity from DNS query patterns/signatures. Always labeled as inference, never presented as ground truth.

`id: application_detection`

### #39 — Search vs. Direct-Navigation Browsing

Distinguishes search-engine use, direct navigation, content platforms, and social media from domain signals. DNS gives signals, not exact page-level history.

`id: search_vs_direct_navigation`

### #40 — Background vs. Interactive Traffic

Identifies likely-background traffic via regularity, low session correlation, and periodic request patterns.

`id: background_vs_interactive_traffic`

### #41 — Periodicity Detection

Identifies telemetry heartbeats, background services, and monitoring traffic via query regularity.

```
CV = stddev / mean ; Periodicity = 1 - CV
```

`id: periodicity_detection`

### #42 — Domain Correlation

Builds a domain relationship graph from co-occurrence within sessions.

```
P(B|A) = Sessions(A,B) / Sessions(A)
```

`id: domain_correlation`

### #43 — Domain Clusters

Groups of domains the network actually uses together, discovered via co-occurrence.

`id: domain_clusters`

### #44 — Domain Transition Analysis

Models A -> B -> C domain navigation sequences to understand real navigation flow, using conditional transition probabilities.

`id: domain_transition_analysis`

### #45 — Predictive DNS

Anticipates likely next domains from historical query relationships, strictly respecting TTL semantics — never inventing or pre-serving fabricated records.

`id: predictive_dns`

### #46 — Internet Routine Detection

Clusters recurring time/day patterns into workday, weekend, holiday, high-activity, and low-activity regimes.

`id: internet_routine_detection`

### #78 — Multi-Device Session Overlap

Detects concurrent active sessions across devices — household/office usage-overlap context, not identity-linking between devices.

`id: multi_device_session_overlap`

### #79 — Domain Sequence Fingerprint

Short recurring A -> B -> C in-session navigation sequences, treated as a fingerprint of routine behavior.

`id: domain_sequence_fingerprint`

### #80 — Dwell-Implied Engagement

A weak DNS-only proxy for engagement from repeat sub-resolution queries within a session — explicitly never real page dwell time, which DNS cannot observe.

`id: dwell_implied_engagement`

### #81 — Automation vs. Human Pattern Classifier

Combines #41's periodicity and #8's session diversity into one heuristic score distinguishing likely-scripted/background traffic from human-driven browsing.

`id: automation_vs_human_pattern_classifier`

---

## Reporting

### #47 — Weekly Internet Report

Auto-generated summary: total queries, unique domains, new domains, cache hit rate, blocked queries, tracker queries, peak activity, quietest period, avg/P95 latency, category distribution, and week-over-week deltas.

`id: weekly_internet_report`

### #48 — Personal Internet Fingerprint

A single vector combining category shares, diversity, repeat ratio, tracker ratio, blocked ratio, peak hour, and average session length — the network's overall usage signature, trackable over time.

`id: personal_internet_fingerprint`

### #49 — Database Architecture

Three-tier raw / aggregate / intelligence data model. Nothing is ever discarded — see the v1 bible, Section 6.

`id: database_architecture`

### #50 — Privacy Principles

Local-only storage, no cloud telemetry, optional encrypted database, configurable retention, full data deletion on request, full export, anonymization tooling, and per-device privacy controls.

`id: privacy_principles`

### #82 — Monthly Internet Report

The same shape as #47, month-scoped, with month-over-month deltas instead of week-over-week.

`id: monthly_internet_report`

### #83 — Tool Usage Meta-Metrics

Usage counts for netintel's own features: saved Explorer queries, dashboards, and scheduled reports.

`id: tool_usage_meta_metrics`

### #84 — Data Retention & Storage Footprint

Real per-table row/byte size (via SQLite's dbstat), database file size, and the oldest retained record — live numbers behind #49's architecture.

`id: data_retention_storage_footprint`

---

## Protocol

### #85 — Query Type Distribution

Breakdown of A/AAAA/CNAME/MX/TXT/NS/SOA/PTR/SRV/other record types queried, network-wide and per-domain.

`id: query_type_distribution`

### #86 — IPv4 vs IPv6 Resolution Mix

A vs AAAA query share network-wide, plus per-client dual-stack vs. IPv4-only classification.

`id: ipv4_vs_ipv6_mix`

### #87 — CNAME Chain Depth

Average/max length of CNAME redirection chains, a proxy for CDN/tracker redirection complexity. Depends on the raw answer field, whose exact Technitium format is unconfirmed — needs live-instance verification.

`id: cname_chain_depth`

### #88 — Reverse DNS (PTR) Query Volume

PTR lookup activity, often generated by security tools/logging rather than normal browsing.

`id: reverse_dns_query_volume`

### #89 — Malformed/Refused Query Rate

Share of queries Technitium logged as REFUSED, separate from NXDOMAIN — a misconfigured-device or probing signal. Genuinely unparseable queries that never reach the log aren't visible here.

`id: malformed_refused_query_rate`

### #90 — DoH/DoT/DoQ Bypass Attempts

Visible DNS-layer attempts to resolve known public DoH/DoT/DoQ provider hostnames — relevant to keeping resolution flowing through the local resolver. Only the lookup itself is visible; the encrypted traffic that would follow is not.

`id: doh_dot_doq_bypass_attempts`

---

## DHCP

### #91 — Lease Churn

New vs. expired vs. renewed DHCP leases per day — a proxy for device turnover (guests, IoT reconnects, reboots).

`id: dhcp_lease_churn`

### #92 — Lease Duration Distribution

How long devices typically hold a lease before renewal, IP change, or expiry.

`id: dhcp_lease_duration_distribution`

### #93 — IP Reuse & Identity Continuity

How often a 'new'-looking lease is actually a returning MAC vs. genuinely new hardware never seen before.

`id: ip_reuse_identity_continuity`

### #94 — DHCP-to-DNS Activity Gap

Time between a device receiving a lease and its first DNS query after that — flags devices that hold a lease but rarely/never resolve anything.

`id: dhcp_to_dns_activity_gap`

---

## Capacity

### #95 — Query Volume Forecast

7/30-day projected query volume with a real linear-regression trend line from daily capacity snapshots.

`id: query_volume_forecast`

### #96 — Database Growth Forecast

Projected database size and estimated disk run-out date from historical growth rate.

`id: database_growth_forecast`

### #97 — Device Count Forecast

Projected active-device-count trend, useful for household/office capacity planning.

`id: device_count_forecast`

---

## Infrastructure

### #98 — Host Resource Utilization

netintel's own host CPU/memory/disk over time — the machine running netintel, not the network's devices — sampled every few minutes.

`id: host_resource_utilization`

### #99 — Process Uptime & Restart History

netintel server's own uptime and restart count, distinguishing a clean shutdown from an inferred crash.

`id: process_uptime_restart_history`

### #100 — Collector Health Timeline

Technitium reachability over time: uptime percentage, outage count, and outage duration — the persisted history behind the live collector/health.ts status.

`id: collector_health_timeline`

---

