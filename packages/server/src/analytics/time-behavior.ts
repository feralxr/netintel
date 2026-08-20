import { db } from "../db/client.js";
import { dnsEvents } from "../db/schema.js";
import { eq, asc } from "drizzle-orm";

// -----------------------------------------------------------------------
// Metric #5 — Time-of-Day Behavior
// -----------------------------------------------------------------------
export function timeOfDayBehavior(events: { timestamp: string }[]) {
  const hourCounts = new Array(24).fill(0);
  for (const e of events) {
    const hour = new Date(e.timestamp).getUTCHours();
    hourCounts[hour]++;
  }
  const total = hourCounts.reduce((a, b) => a + b, 0);
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const quietHour = hourCounts.indexOf(Math.min(...hourCounts.filter((c) => c >= 0)));

  // "Active hours" = hours with above-average volume; ActivityRatio = their share of total.
  const avg = total / 24;
  const activeHourVolume = hourCounts.filter((c) => c > avg).reduce((a, b) => a + b, 0);
  const activityRatio = total > 0 ? activeHourVolume / total : 0;

  return { hourCounts, peakHour, quietHour, activityRatio, total };
}

// -----------------------------------------------------------------------
// Metric #6 — Day-of-Week Behavior
// -----------------------------------------------------------------------
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayOfWeekBehavior(events: { timestamp: string }[]) {
  const dayCounts = new Array(7).fill(0);
  for (const e of events) {
    dayCounts[new Date(e.timestamp).getUTCDay()]++;
  }
  return DAY_NAMES.map((name, i) => ({ day: name, queries: dayCounts[i] }));
}

// -----------------------------------------------------------------------
// Metrics #7/#8 — Sessions & Session Diversity
//   Sessions are approximated via a 30-minute inactivity gap per client.
// -----------------------------------------------------------------------
const SESSION_GAP_MS = 30 * 60 * 1000;

export interface Session {
  clientId: string;
  start: string;
  end: string;
  durationMinutes: number;
  queryCount: number;
  uniqueDomains: number;
  diversity: number; // metric #8: unique domains / total queries in-session
  domainSequence: string[]; // chronological order, used by metrics #42-45
}

export function computeSessions(clientId: string, limit = 5000): Session[] {
  const clientRows = db
    .select({ timestamp: dnsEvents.timestamp, domain: dnsEvents.domain })
    .from(dnsEvents)
    .where(eq(dnsEvents.clientId, clientId))
    .orderBy(asc(dnsEvents.timestamp))
    .limit(limit)
    .all();

  const sessions: Session[] = [];
  let current: { start: number; last: number; domains: Set<string>; count: number; sequence: string[] } | null = null;

  for (const row of clientRows) {
    const t = new Date(row.timestamp).getTime();
    if (!current) {
      current = { start: t, last: t, domains: new Set([row.domain]), count: 1, sequence: [row.domain] };
      continue;
    }
    if (t - current.last > SESSION_GAP_MS) {
      sessions.push(finalizeSession(clientId, current));
      current = { start: t, last: t, domains: new Set([row.domain]), count: 1, sequence: [row.domain] };
    } else {
      current.last = t;
      current.domains.add(row.domain);
      current.count++;
      current.sequence.push(row.domain);
    }
  }
  if (current) sessions.push(finalizeSession(clientId, current));

  return sessions;
}

function finalizeSession(
  clientId: string,
  s: { start: number; last: number; domains: Set<string>; count: number; sequence: string[] }
): Session {
  const durationMinutes = (s.last - s.start) / 60_000;
  return {
    clientId,
    start: new Date(s.start).toISOString(),
    end: new Date(s.last).toISOString(),
    durationMinutes,
    queryCount: s.count,
    uniqueDomains: s.domains.size,
    diversity: s.count > 0 ? s.domains.size / s.count : 0,
    domainSequence: s.sequence,
  };
}

export function sessionSummary(sessions: Session[]) {
  if (sessions.length === 0) {
    return { sessionCount: 0, avgDurationMinutes: 0, medianDurationMinutes: 0, longestDurationMinutes: 0, avgQueriesPerSession: 0, avgDomainsPerSession: 0, avgDiversity: 0 };
  }
  const durations = sessions.map((s) => s.durationMinutes).sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  return {
    sessionCount: sessions.length,
    avgDurationMinutes: durations.reduce((a, b) => a + b, 0) / durations.length,
    medianDurationMinutes: durations.length % 2 === 0 ? (durations[mid - 1] + durations[mid]) / 2 : durations[mid],
    longestDurationMinutes: Math.max(...durations),
    avgQueriesPerSession: sessions.reduce((a, s) => a + s.queryCount, 0) / sessions.length,
    avgDomainsPerSession: sessions.reduce((a, s) => a + s.uniqueDomains, 0) / sessions.length,
    avgDiversity: sessions.reduce((a, s) => a + s.diversity, 0) / sessions.length,
  };
}
