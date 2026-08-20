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
  | "reporting";

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
];

export function getMetric(id: string): MetricDefinition | undefined {
  return METRICS.find((m) => m.id === id);
}

export function getMetricsByGroup(group: MetricGroup): MetricDefinition[] {
  return METRICS.filter((m) => m.group === group);
}
