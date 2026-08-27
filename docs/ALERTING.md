# netintel — Alerting Reference

Alert policies fire when a condition breaches a threshold, and can act (notify in-app, email, webhook, flag a device, or auto-block a domain). Manage them via the web dashboard's **Alerts** page, or directly through the API.

---

## Two kinds of conditions

A policy has one or more **conditions** combined with `AND`/`OR` logic. Each condition comes from one of two sources:

### 1. Explorer conditions (`source: "explorer"`, the default)

Query `dns_events` directly, over a rolling time window, using the same metric vocabulary as the Explorer page (`count`, `uniqueDomains`, `uniqueClients`, `avgResponseTime`, `blockedCount`, `nxdomainCount`, optionally filtered/grouped).

```json
{
  "source": "explorer",
  "query": { "metric": "nxdomainCount" },
  "windowMinutes": 15,
  "comparison": { "operator": "gt", "threshold": 20 }
}
```

`source` can be omitted entirely for this type — it's the default, and every policy created before the metric-snapshot type existed has no `source` field at all. Both forms evaluate identically.

### 2. System/security metric conditions (`source: "metric_snapshot"`)

Read one of a curated set of point-in-time metrics that live outside `dns_events` — host health samples, DHCP lease events, capacity forecasts, security candidate-signal counts. These can't be expressed as an Explorer query since they're not `dns_events` aggregates.

```json
{
  "source": "metric_snapshot",
  "metricId": "host_memory_used_percent",
  "comparison": { "operator": "gt", "threshold": 90 }
}
```

`windowMinutes` is optional here and only affects the alert's cooldown period between repeat firings (default 15 minutes) — the read itself is always "right now," not averaged over a window.

---

## The snapshot metric catalog

Fetch the current list from the running server: `GET /api/alerts/snapshot-metrics`. As of this writing:

| `metricId` | Label | Group | Unit |
|---|---|---|---|
| `host_memory_used_percent` | Host memory used % | infrastructure | % |
| `host_cpu_load_avg_1m` | Host CPU load (1m avg) | infrastructure | — (unavailable on Windows) |
| `collector_uptime_percent_recent` | Collector uptime % (last 20 checks) | infrastructure | % |
| `collector_consecutive_outage_samples` | Collector consecutive failed checks | infrastructure | checks |
| `restarts_last_24h` | Server restarts (last 24h) | infrastructure | restarts |
| `dhcp_lease_churn_today` | DHCP lease churn today (new + renewed + IP changed + expired) | dhcp | events |
| `db_size_bytes` | Database file size | capacity | bytes |
| `disk_days_until_full` | Estimated days until disk full | capacity | days |
| `punycode_domain_count` | Punycode/homograph domains observed | security | domains |
| `dns_tunneling_candidate_count` | DNS tunneling candidate domains | security | domains |
| `suspicious_tld_share_percent` | Suspicious TLD share of all queries | security | % |

A metric reading `null` (rather than a number) means it's genuinely unavailable right now — e.g. `host_cpu_load_avg_1m` on Windows, or `disk_days_until_full` before there's enough history for a trend. A condition on a `null`-valued metric simply doesn't breach; it doesn't error.

---

## Comparison operators

`gt` `lt` `gte` `lte` `eq` `ne` — greater/less than, greater/less-or-equal, equal, not-equal.

## Combination logic

`AND` — every condition in the policy must breach. `OR` — any one condition breaching is enough. With a grouped Explorer query (a `groupBy` dimension), the policy fires if *any* group breaches the threshold — same behavior as alerting on a per-entity basis (e.g. "any single client's NXDOMAIN count," not just the network-wide total).

---

## Worked examples

**Host running low on memory:**
```json
{
  "name": "High host memory",
  "severity": "warning",
  "channels": ["in_app"],
  "definition": {
    "logic": "AND",
    "conditions": [
      { "source": "metric_snapshot", "metricId": "host_memory_used_percent", "comparison": { "operator": "gt", "threshold": 90 } }
    ]
  }
}
```

**Collector has been down for a while (not just a single blip):**
```json
{
  "name": "Collector outage",
  "severity": "critical",
  "channels": ["in_app", "email:you@example.com"],
  "definition": {
    "logic": "AND",
    "conditions": [
      { "source": "metric_snapshot", "metricId": "collector_consecutive_outage_samples", "comparison": { "operator": "gte", "threshold": 4 } }
    ]
  }
}
```

**Unusual device turnover (possible new/unexpected devices):**
```json
{
  "name": "DHCP churn spike",
  "severity": "warning",
  "channels": ["in_app"],
  "definition": {
    "logic": "AND",
    "conditions": [
      { "source": "metric_snapshot", "metricId": "dhcp_lease_churn_today", "windowMinutes": 30, "comparison": { "operator": "gt", "threshold": 20 } }
    ]
  }
}
```

**Combining both condition types — a real security signal AND general network noise:**
```json
{
  "name": "Suspicious activity with high query volume",
  "severity": "critical",
  "channels": ["in_app"],
  "definition": {
    "logic": "AND",
    "conditions": [
      { "source": "metric_snapshot", "metricId": "dns_tunneling_candidate_count", "comparison": { "operator": "gte", "threshold": 3 } },
      { "source": "explorer", "query": { "metric": "count" }, "windowMinutes": 15, "comparison": { "operator": "gt", "threshold": 500 } }
    ]
  }
}
```

---

## Creating a policy

**Web UI:** Alerts page → pick a metric source (DNS traffic vs. System/security metric) → pick the specific metric → set operator/threshold → set channels → **Create policy**.

**API:**
```bash
curl -X POST http://localhost:8787/api/alerts/policies \
  -H "Content-Type: application/json" \
  -d '{ "name": "...", "severity": "warning", "channels": ["in_app"], "definition": { ... } }'
```

**Testing a definition before saving it:**
```bash
curl -X POST http://localhost:8787/api/alerts/policies/test \
  -H "Content-Type: application/json" \
  -d '{ "logic": "AND", "conditions": [ ... ] }'
```
Returns `{ triggered, explanation, value }` immediately, without creating a stored policy.

---

## Actions

A policy's `action` (separate from its notification channels) can additionally:
- `flag_device` — mark a device as flagged in the dashboard
- `block_domain` — call Technitium's `/api/blocking/blocked/add` to block a specific domain

`block_domain` in particular is worth testing against your real instance before relying on it — see [`docs/WINDOWS_TESTING.md`](./WINDOWS_TESTING.md)'s block-action verification step (Phase 3f).
