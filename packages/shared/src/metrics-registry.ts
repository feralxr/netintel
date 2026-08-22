// The single source of truth for "what does this metric mean".
// Both the web dashboard (info tooltips) and the CLI (`netintel explain <id>`)
// render directly from this table — see Bible section 7.

export type MetricGroup =
  | "domain"
  | "security"
  | "performance"
  | "device"
  | "trends"
  | "behavioral"
  | "reporting"
  | "protocol"
  | "dhcp"
  | "capacity"
  | "infrastructure";

export interface MetricDefinition {
  id: string;
  number: number;
  name: string;
  group: MetricGroup;
  description: string;
  formula?: string;
}

export const METRICS: MetricDefinition[] = [
  { number: 1, id: "domain_statistics", group: "domain", name: "Domain Statistics",
    description: "Per-domain query count, unique clients, first/last seen, queries per day/hour, time since last query, and the full distribution (mean/median/p25/p75/p95/min/max/stddev) of revisit intervals." },
  { number: 2, id: "domain_popularity_score", group: "domain", name: "Domain Popularity Score",
    description: "A blended score of how much, how recently, and how consistently a domain is used.",
    formula: "Popularity = w1*log(1+Q) + w2*R + w3*U + w4*F  (Q=query count, R=recency, U=unique active days, F=frequency regularity)" },
  { number: 3, id: "unique_domain_statistics", group: "domain", name: "Unique Domain Statistics",
    description: "Count of distinct domains queried per day/week/month, and their growth rate over time.",
    formula: "Growth = (D_t - D_t-1) / D_t-1" },
  { number: 4, id: "domain_concentration", group: "domain", name: "Domain Concentration",
    description: "How concentrated vs. spread out browsing is: share of total queries held by the top 1/5/10/50 domains, summarized by the Herfindahl-Hirschman Index.",
    formula: "HHI = sum(p_i^2)" },
  { number: 5, id: "time_of_day_behavior", group: "domain", name: "Time-of-Day Behavior",
    description: "Query volume by hour, including peak hour, peak period, and quiet period.",
    formula: "ActivityRatio = active-hour queries / total queries" },
  { number: 6, id: "day_of_week_behavior", group: "domain", name: "Day-of-Week Behavior",
    description: "Compares query volume and category mix across Monday through Sunday." },
  { number: 7, id: "sessions", group: "domain", name: "Sessions",
    description: "Browsing sessions approximated via an inactivity gap (default 30 min): sessions per day, average/median duration, longest session, queries per session, domains per session." },
  { number: 8, id: "session_diversity", group: "domain", name: "Session Diversity",
    description: "How exploratory vs. repetitive a session was.",
    formula: "Diversity = unique domains in session / total queries in session" },
  { number: 9, id: "domain_categories", group: "domain", name: "Domain Categories",
    description: "Query volume, unique domains, time-of-day distribution, growth, and concentration broken down per category (Search, Social, Entertainment, Streaming, News, Shopping, Finance, Banking, Education, Development, Cloud, Productivity, Communication, Gaming, AI, Advertising, Analytics, Telemetry, CDN, Security, Software Updates, OS)." },
  { number: 10, id: "first_party_vs_third_party", group: "domain", name: "First-Party vs. Third-Party Activity",
    description: "Distinguishes domains you directly visited from domains loaded incidentally by those sites.",
    formula: "TPR = third-party queries / total queries" },
  { number: 11, id: "tracking_footprint", group: "domain", name: "Tracking Footprint",
    description: "Ad, analytics, fingerprinting, telemetry, social-tracking, and marketing domain activity: trackers per day, unique trackers, tracker percentage, top trackers, and which sites trigger the most trackers." },
  { number: 12, id: "block_statistics", group: "domain", name: "Block Statistics",
    description: "Total and per-day/hour blocked queries, unique blocked domains, and blocked domains broken down by client and category.",
    formula: "BlockRate = blocked queries / total queries * 100" },

  { number: 13, id: "security_analytics", group: "security", name: "Security Analytics",
    description: "Unified security surface combining NXDOMAIN, SERVFAIL, REFUSED, timeouts, blocked queries, suspicious domains, DGA-like domains, new domains, and high-frequency unknown domains." },
  { number: 14, id: "nxdomain_analysis", group: "security", name: "NXDOMAIN Analysis",
    description: "Rate of non-existent-domain responses, tracked by day/hour/client/domain with spike detection.",
    formula: "NXRate = NXDOMAIN responses / total queries" },
  { number: 15, id: "domain_entropy", group: "security", name: "Domain Entropy",
    description: "Shannon entropy of a domain's character distribution, used as one feature (never standalone proof) for spotting suspicious or algorithmically-generated domains.",
    formula: "H(X) = -sum(p(x) * log2(p(x)))" },
  { number: 16, id: "newly_observed_domains", group: "security", name: "Newly Observed Domains",
    description: "New domains per day/week/month, never-before-seen domains, one-time domains, and emerging domains, based on tracked first_seen/last_seen/query_count." },
  { number: 17, id: "domain_lifecycle_classification", group: "security", name: "Domain Lifecycle Classification",
    description: "Classifies every domain as New, Emerging, Regular, Dormant, Returning, One-time, or Disappeared based on the shape of its query history." },
  { number: 30, id: "behavioral_anomaly_detection", group: "security", name: "Behavioral Anomaly Detection",
    description: "Compares live queries/hour, unique domains/hour, NXDOMAIN rate, tracker rate, and category distribution against a learned baseline, flagging deviations." },
  { number: 31, id: "zscore_anomaly_detection", group: "security", name: "Z-Score Anomaly Detection",
    description: "Statistical outlier detection per metric stream. Surfaced as a candidate anomaly, never as proof of compromise.",
    formula: "z = (x - mean) / stddev ; |z| > 3 is flagged as a candidate strong anomaly" },

  { number: 18, id: "dns_performance", group: "performance", name: "DNS Performance",
    description: "Response, cache, recursive, and upstream latency plus timeout/failure rate, summarized as mean, median, p50/p90/p95/p99, max, and stddev." },
  { number: 19, id: "cache_performance", group: "performance", name: "Cache Performance",
    description: "Share of eligible queries served from cache, tracked by day/hour/domain/client.",
    formula: "CacheHitRate = cached queries / total eligible queries * 100" },
  { number: 20, id: "cache_opportunity", group: "performance", name: "Cache Opportunity",
    description: "Domains with high query frequency but low cache hit rate — the concrete list of where caching would help most." },
  { number: 21, id: "ttl_analytics", group: "performance", name: "TTL Analytics",
    description: "Average/median/min/max TTL and the full TTL distribution across all resolved domains." },
  { number: 22, id: "intelligent_prefetch_score", group: "performance", name: "Intelligent Prefetch Score",
    description: "Drives which domains get proactively refreshed before TTL expiry.",
    formula: "PrefetchScore = Frequency * Recency * ExpiryProbability * LatencyBenefit" },
  { number: 23, id: "dns_latency_savings", group: "performance", name: "DNS Latency Savings",
    description: "DNS-resolution latency saved by caching. Explicitly scoped to DNS resolution only — never conflated with total page-load or browsing time saved.",
    formula: "LatencySaved = RecursiveQueries * (RecursiveLatency - CacheLatency)" },
  { number: 24, id: "upstream_comparison", group: "performance", name: "Upstream Comparison",
    description: "Live comparison of configured upstream resolvers (e.g. Quad9, Cloudflare, Google, AdGuard) on latency, success rate, timeout rate, DNSSEC behavior, and availability.",
    formula: "Score = w1*Latency + w2*Reliability + w3*Security" },
  { number: 25, id: "network_reliability", group: "performance", name: "Network Reliability",
    description: "Overall DNS availability based on failures, timeouts, SERVFAIL, and upstream failures.",
    formula: "DNSAvailability = 1 - (failed queries / total queries)" },

  { number: 26, id: "device_analytics", group: "device", name: "Device Analytics",
    description: "Per-device queries, unique domains, blocked count, NXDOMAIN count, category mix, peak hours, and cache hit rate." },
  { number: 27, id: "device_behavioral_fingerprint", group: "device", name: "Device Behavioral Fingerprint",
    description: "A per-device 'shape of usage' vector: domain diversity, category distribution, query rate, active hours, tracker ratio, blocked ratio, NXDOMAIN rate, and average session length." },
  { number: 28, id: "cross_device_comparison", group: "device", name: "Cross-Device Comparison",
    description: "Side-by-side comparison of all live devices on queries, unique domains, trackers, NXDOMAIN rate, cache hit rate, and more." },

  { number: 29, id: "internet_activity_trends", group: "trends", name: "Internet Activity Trends",
    description: "Total queries, unique domains, new domains, blocked domains, tracker queries, category usage, DNS latency, and cache hit rate, tracked over weeks/months.",
    formula: "MoM = (current - previous) / previous * 100" },
  { number: 32, id: "entropy_of_browsing_behavior", group: "trends", name: "Entropy of Browsing Behavior",
    description: "Low entropy means concentrated/routine activity; high entropy means diverse/exploratory activity across categories.",
    formula: "H = -sum(p_i * log2(p_i)) across category shares" },
  { number: 33, id: "domain_diversity_index", group: "trends", name: "Domain Diversity Index",
    description: "How varied domain usage is relative to total query volume.",
    formula: "D = unique domains / total queries" },
  { number: 34, id: "repeat_ratio", group: "trends", name: "Repeat Ratio",
    description: "How habitual vs. novel browsing is.",
    formula: "RepeatRatio = 1 - (unique domains / total queries)" },
  { number: 35, id: "top_domain_dependency", group: "trends", name: "Top-Domain Dependency",
    description: "Share of all queries held by the top 1%/5%/10%/50% of domains — how dependent the network is on a small set of destinations." },
  { number: 36, id: "ecosystem_analysis", group: "trends", name: "Ecosystem Analysis",
    description: "Domains grouped by parent ecosystem (Google, Microsoft, Apple, Amazon, Meta, Cloudflare, GitHub, OpenAI, etc.) with queries, unique domains, share, and growth per ecosystem." },
  { number: 37, id: "infrastructure_dependency", group: "trends", name: "Infrastructure Dependency",
    description: "How reliant the network is on each infrastructure layer: CDN, cloud hosting, DNS, analytics, advertising, authentication, API, and storage." },

  { number: 38, id: "application_detection", group: "behavioral", name: "Application Detection",
    description: "Infers likely application activity from DNS query patterns/signatures. Always labeled as inference, never presented as ground truth." },
  { number: 39, id: "search_vs_direct_navigation", group: "behavioral", name: "Search vs. Direct-Navigation Browsing",
    description: "Distinguishes search-engine use, direct navigation, content platforms, and social media from domain signals. DNS gives signals, not exact page-level history." },
  { number: 40, id: "background_vs_interactive_traffic", group: "behavioral", name: "Background vs. Interactive Traffic",
    description: "Identifies likely-background traffic via regularity, low session correlation, and periodic request patterns." },
  { number: 41, id: "periodicity_detection", group: "behavioral", name: "Periodicity Detection",
    description: "Identifies telemetry heartbeats, background services, and monitoring traffic via query regularity.",
    formula: "CV = stddev / mean ; Periodicity = 1 - CV" },
  { number: 42, id: "domain_correlation", group: "behavioral", name: "Domain Correlation",
    description: "Builds a domain relationship graph from co-occurrence within sessions.",
    formula: "P(B|A) = Sessions(A,B) / Sessions(A)" },
  { number: 43, id: "domain_clusters", group: "behavioral", name: "Domain Clusters",
    description: "Groups of domains the network actually uses together, discovered via co-occurrence." },
  { number: 44, id: "domain_transition_analysis", group: "behavioral", name: "Domain Transition Analysis",
    description: "Models A -> B -> C domain navigation sequences to understand real navigation flow, using conditional transition probabilities." },
  { number: 45, id: "predictive_dns", group: "behavioral", name: "Predictive DNS",
    description: "Anticipates likely next domains from historical query relationships, strictly respecting TTL semantics — never inventing or pre-serving fabricated records." },
  { number: 46, id: "internet_routine_detection", group: "behavioral", name: "Internet Routine Detection",
    description: "Clusters recurring time/day patterns into workday, weekend, holiday, high-activity, and low-activity regimes." },

  { number: 47, id: "weekly_internet_report", group: "reporting", name: "Weekly Internet Report",
    description: "Auto-generated summary: total queries, unique domains, new domains, cache hit rate, blocked queries, tracker queries, peak activity, quietest period, avg/P95 latency, category distribution, and week-over-week deltas." },
  { number: 48, id: "personal_internet_fingerprint", group: "reporting", name: "Personal Internet Fingerprint",
    description: "A single vector combining category shares, diversity, repeat ratio, tracker ratio, blocked ratio, peak hour, and average session length — the network's overall usage signature, trackable over time." },
  { number: 49, id: "database_architecture", group: "reporting", name: "Database Architecture",
    description: "Three-tier raw / aggregate / intelligence data model. Nothing is ever discarded — see the v1 bible, Section 6." },
  { number: 50, id: "privacy_principles", group: "reporting", name: "Privacy Principles",
    description: "Local-only storage, no cloud telemetry, optional encrypted database, configurable retention, full data deletion on request, full export, anonymization tooling, and per-device privacy controls." },

  // -------------------------------------------------------------------
  // v2.12 — 100-metric expansion (#51-100)
  // -------------------------------------------------------------------

  { number: 51, id: "domain_response_code_distribution", group: "domain", name: "Domain Response Code Distribution",
    description: "NOERROR/NXDOMAIN/SERVFAIL/REFUSED/timeout mix, per domain and network-wide." },
  { number: 52, id: "domain_co_visit_recency", group: "domain", name: "Domain Co-Visit Recency",
    description: "For domains already known to be paired (via #42), the time-lag between their two most recent visits — how in-sync a pair's usage still is right now." },
  { number: 53, id: "domain_query_burstiness", group: "domain", name: "Domain Query Burstiness",
    description: "How bursty vs. evenly-spaced a domain's queries are.",
    formula: "Fano = variance(inter-query gaps) / mean(inter-query gaps)" },
  { number: 54, id: "subdomain_fragmentation", group: "domain", name: "Subdomain Fragmentation",
    description: "Count of distinct subdomains generated under a base domain — a proxy for CDN sharding or dynamic tracker subdomains." },
  { number: 55, id: "domain_recency_decay_score", group: "domain", name: "Domain Recency Decay Score",
    description: "An exponentially-weighted recency score for fading domains out of 'active' views without deleting their history.",
    formula: "DecayScore = e^(-λ * days_since_last_seen)" },

  { number: 56, id: "suspicious_tld_exposure", group: "security", name: "Suspicious TLD Exposure",
    description: "Query share to TLDs statistically associated with abuse, tracked as a trend only — never used as a block signal on its own." },
  { number: 57, id: "punycode_homograph_detection", group: "security", name: "Punycode / Homograph Domain Detection",
    description: "Flags domains using punycode (xn--) or mixed-script characters, a common phishing/homograph-attack technique." },
  { number: 58, id: "dns_tunneling_heuristics", group: "security", name: "DNS Tunneling Heuristics",
    description: "Candidate signal combining high query rate, long query labels, and high character entropy for one domain — never a verdict on its own." },
  { number: 59, id: "repeated_failure_burst_detection", group: "security", name: "Repeated Failure Burst Detection",
    description: "Clusters of NXDOMAIN/SERVFAIL from the same client in a short window — can indicate malware C2 domain-generation attempts, or just a misconfigured device." },
  { number: 60, id: "blocklist_hit_attribution", group: "security", name: "Blocklist Hit Attribution",
    description: "Which category triggered each block, and per-category effectiveness over time. Attributed by netintel's own domain category, not by upstream blocklist name." },
  { number: 61, id: "new_device_security_baseline", group: "security", name: "New Device Security Baseline",
    description: "Snapshots a newly-seen device's first-24h query pattern as the initial baseline that #30's anomaly detection compares later activity against." },
  { number: 62, id: "alert_to_incident_correlation", group: "security", name: "Alert-to-Incident Correlation",
    description: "Links a fired alert policy back to the underlying security-analytics signals recorded near the same timestamp, for post-hoc review." },

  { number: 63, id: "per_client_latency_breakdown", group: "performance", name: "Per-Client Latency Breakdown",
    description: "Response-time distribution scoped per device rather than network-wide, to spot a single slow/misbehaving client." },
  { number: 64, id: "recursive_vs_cached_ratio_over_time", group: "performance", name: "Recursive vs Cached Ratio Over Time",
    description: "Daily trend of the recursive/cache split — an early signal for cache tuning or TTL misconfiguration." },
  { number: 65, id: "query_retransmission_rate", group: "performance", name: "Query Retransmission Rate",
    description: "Share of queries that look retried shortly after a prior query for the same client+domain — a proxy for resolver/network instability from query-log timing alone." },
  { number: 66, id: "dnssec_validation_rate", group: "performance", name: "DNSSEC Validation Rate",
    description: "Share of validated vs. unvalidated vs. bogus DNSSEC responses. Not currently exposed by the fields netintel reads from Technitium's query log — reported honestly as unavailable." },
  { number: 67, id: "edns_protocol_feature_usage", group: "performance", name: "EDNS/Protocol Feature Usage",
    description: "Real protocol distribution (UDP/TCP/DoT/DoH/DoQ) and TCP-fallback share. EDNS0 usage and truncated (TC-bit) response detection aren't exposed by the collector yet." },
  { number: 68, id: "response_size_distribution", group: "performance", name: "Response Size Distribution",
    description: "DNS response payload size distribution. Not currently exposed by the fields netintel reads from Technitium's query log — reported honestly as unavailable." },

  { number: 69, id: "device_onboarding_timeline", group: "device", name: "Device Onboarding Timeline",
    description: "A chronological view of a device's lifecycle: first-seen, first-classified-category, first-flagged-event, and current status." },
  { number: 70, id: "device_idle_detection", group: "device", name: "Device Idle Detection",
    description: "Identifies devices with DNS history but no meaningful recent activity — asleep or idle networked hardware rather than genuinely gone." },
  { number: 71, id: "device_category_affinity_shift", group: "device", name: "Device Category Affinity Shift",
    description: "Compares a device's dominant category mix this week against last week, to surface a device's usage character drifting over time." },
  { number: 72, id: "mac_vendor_oui_classification", group: "device", name: "MAC Vendor / OUI Classification",
    description: "Best-effort device-type hint from the DHCP-reported MAC vendor prefix, against a small offline table. A hint, never a guarantee — MACs can be randomized." },
  { number: 73, id: "device_query_rate_percentile_rank", group: "device", name: "Device Query Rate Percentile Rank",
    description: "Ranks each device against every other active device by query volume — spot the loudest clients on the network at a glance." },

  { number: 74, id: "category_share_momentum", group: "trends", name: "Category Share Momentum",
    description: "Week-over-week rate of change (not just level) of each category's share of total queries — surfaces categories rising or falling fastest." },
  { number: 75, id: "seasonal_pattern_detection", group: "trends", name: "Seasonal Pattern Detection",
    description: "Compares current daily query volume against the same weekday in prior weeks, to separate a genuine trend from routine weekly cycles." },
  { number: 76, id: "domain_churn_rate", group: "trends", name: "Domain Churn Rate",
    description: "Share of the network's active domain set that changed between periods.",
    formula: "Churn = (dropped + added) / total_domains_either_period" },
  { number: 77, id: "long_term_retention_curve", group: "trends", name: "Long-Term Retention Curve",
    description: "Cohort-style: of domains first seen N days ago (1/7/14/30/60/90-day buckets), what share are still queried today." },

  { number: 78, id: "multi_device_session_overlap", group: "behavioral", name: "Multi-Device Session Overlap",
    description: "Detects concurrent active sessions across devices — household/office usage-overlap context, not identity-linking between devices." },
  { number: 79, id: "domain_sequence_fingerprint", group: "behavioral", name: "Domain Sequence Fingerprint",
    description: "Short recurring A -> B -> C in-session navigation sequences, treated as a fingerprint of routine behavior." },
  { number: 80, id: "dwell_implied_engagement", group: "behavioral", name: "Dwell-Implied Engagement",
    description: "A weak DNS-only proxy for engagement from repeat sub-resolution queries within a session — explicitly never real page dwell time, which DNS cannot observe." },
  { number: 81, id: "automation_vs_human_pattern_classifier", group: "behavioral", name: "Automation vs. Human Pattern Classifier",
    description: "Combines #41's periodicity and #8's session diversity into one heuristic score distinguishing likely-scripted/background traffic from human-driven browsing." },

  { number: 82, id: "monthly_internet_report", group: "reporting", name: "Monthly Internet Report",
    description: "The same shape as #47, month-scoped, with month-over-month deltas instead of week-over-week." },
  { number: 83, id: "tool_usage_meta_metrics", group: "reporting", name: "Tool Usage Meta-Metrics",
    description: "Usage counts for netintel's own features: saved Explorer queries, dashboards, and scheduled reports." },
  { number: 84, id: "data_retention_storage_footprint", group: "reporting", name: "Data Retention & Storage Footprint",
    description: "Real per-table row/byte size (via SQLite's dbstat), database file size, and the oldest retained record — live numbers behind #49's architecture." },

  { number: 85, id: "query_type_distribution", group: "protocol", name: "Query Type Distribution",
    description: "Breakdown of A/AAAA/CNAME/MX/TXT/NS/SOA/PTR/SRV/other record types queried, network-wide and per-domain." },
  { number: 86, id: "ipv4_vs_ipv6_mix", group: "protocol", name: "IPv4 vs IPv6 Resolution Mix",
    description: "A vs AAAA query share network-wide, plus per-client dual-stack vs. IPv4-only classification." },
  { number: 87, id: "cname_chain_depth", group: "protocol", name: "CNAME Chain Depth",
    description: "Average/max length of CNAME redirection chains, a proxy for CDN/tracker redirection complexity. Depends on the raw answer field, whose exact Technitium format is unconfirmed — needs live-instance verification." },
  { number: 88, id: "reverse_dns_query_volume", group: "protocol", name: "Reverse DNS (PTR) Query Volume",
    description: "PTR lookup activity, often generated by security tools/logging rather than normal browsing." },
  { number: 89, id: "malformed_refused_query_rate", group: "protocol", name: "Malformed/Refused Query Rate",
    description: "Share of queries Technitium logged as REFUSED, separate from NXDOMAIN — a misconfigured-device or probing signal. Genuinely unparseable queries that never reach the log aren't visible here." },
  { number: 90, id: "doh_dot_doq_bypass_attempts", group: "protocol", name: "DoH/DoT/DoQ Bypass Attempts",
    description: "Visible DNS-layer attempts to resolve known public DoH/DoT/DoQ provider hostnames — relevant to keeping resolution flowing through the local resolver. Only the lookup itself is visible; the encrypted traffic that would follow is not." },

  { number: 91, id: "dhcp_lease_churn", group: "dhcp", name: "Lease Churn",
    description: "New vs. expired vs. renewed DHCP leases per day — a proxy for device turnover (guests, IoT reconnects, reboots)." },
  { number: 92, id: "dhcp_lease_duration_distribution", group: "dhcp", name: "Lease Duration Distribution",
    description: "How long devices typically hold a lease before renewal, IP change, or expiry." },
  { number: 93, id: "ip_reuse_identity_continuity", group: "dhcp", name: "IP Reuse & Identity Continuity",
    description: "How often a 'new'-looking lease is actually a returning MAC vs. genuinely new hardware never seen before." },
  { number: 94, id: "dhcp_to_dns_activity_gap", group: "dhcp", name: "DHCP-to-DNS Activity Gap",
    description: "Time between a device receiving a lease and its first DNS query after that — flags devices that hold a lease but rarely/never resolve anything." },

  { number: 95, id: "query_volume_forecast", group: "capacity", name: "Query Volume Forecast",
    description: "7/30-day projected query volume with a real linear-regression trend line from daily capacity snapshots." },
  { number: 96, id: "database_growth_forecast", group: "capacity", name: "Database Growth Forecast",
    description: "Projected database size and estimated disk run-out date from historical growth rate." },
  { number: 97, id: "device_count_forecast", group: "capacity", name: "Device Count Forecast",
    description: "Projected active-device-count trend, useful for household/office capacity planning." },

  { number: 98, id: "host_resource_utilization", group: "infrastructure", name: "Host Resource Utilization",
    description: "netintel's own host CPU/memory/disk over time — the machine running netintel, not the network's devices — sampled every few minutes." },
  { number: 99, id: "process_uptime_restart_history", group: "infrastructure", name: "Process Uptime & Restart History",
    description: "netintel server's own uptime and restart count, distinguishing a clean shutdown from an inferred crash." },
  { number: 100, id: "collector_health_timeline", group: "infrastructure", name: "Collector Health Timeline",
    description: "Technitium reachability over time: uptime percentage, outage count, and outage duration — the persisted history behind the live collector/health.ts status." },
];

export function getMetric(id: string): MetricDefinition | undefined {
  return METRICS.find((m) => m.id === id);
}

export function getMetricsByGroup(group: MetricGroup): MetricDefinition[] {
  return METRICS.filter((m) => m.group === group);
}
