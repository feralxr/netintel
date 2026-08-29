// Tracks real Technitium health so /api/status reflects actual collector
// health instead of a hardcoded value. Updated by poller.ts.
//
// Deliberately split into THREE independent signals rather than one shared
// flag: pollQueryLogs and pollDhcp run as separate, independently-timed,
// fire-and-forget async calls with no ordering guarantee between them. A
// single shared "reachable" flag meant a successful DHCP poll could
// silently overwrite a failed query-log poll's state back to "healthy" —
// a real race, not hypothetical (a query-log failure gets overwritten
// exactly when a DHCP poll happens to resolve afterward, which is common
// since DHCP polls on its own separate interval). Tracking them
// separately removes that race entirely and lets /api/status tell a user
// exactly *which* thing is broken instead of one ambiguous boolean.

interface ChannelHealth {
  ok: boolean;
  lastError: string | null;
  lastSuccessAt: string | null;
}

const sessionCheck: ChannelHealth = { ok: false, lastError: null, lastSuccessAt: null };
const queryLogs: ChannelHealth = { ok: false, lastError: null, lastSuccessAt: null };
const dhcpLeases: ChannelHealth = { ok: false, lastError: null, lastSuccessAt: null };

function update(channel: ChannelHealth, isOk: boolean, error?: string): void {
  channel.ok = isOk;
  if (isOk) {
    channel.lastError = null;
    channel.lastSuccessAt = new Date().toISOString();
  } else if (error) {
    channel.lastError = error;
  }
}

export function setSessionCheckHealth(ok: boolean, error?: string): void {
  update(sessionCheck, ok, error);
}
export function setQueryLogsHealth(ok: boolean, error?: string): void {
  update(queryLogs, ok, error);
}
export function setDhcpLeasesHealth(ok: boolean, error?: string): void {
  update(dhcpLeases, ok, error);
}

export interface TechnitiumHealthDetail {
  /** True Technitium API up AND the Query Logs (Sqlite) app confirmed working — this is what "reachable" should actually mean for netintel's purposes, since without query logs netintel has no data regardless of whether the session API itself responds. */
  reachable: boolean;
  lastError: string | null;
  sessionCheck: ChannelHealth;
  queryLogs: ChannelHealth;
  dhcpLeases: ChannelHealth;
}

export function getTechnitiumHealth(): TechnitiumHealthDetail {
  const reachable = sessionCheck.ok && queryLogs.ok;
  // Prefer surfacing the query-log error specifically if that's what's
  // broken — it's the one most likely to confuse a user who sees
  // "session check passed" and assumes everything's fine.
  const lastError = !queryLogs.ok ? queryLogs.lastError : !sessionCheck.ok ? sessionCheck.lastError : null;
  return { reachable, lastError, sessionCheck: { ...sessionCheck }, queryLogs: { ...queryLogs }, dhcpLeases: { ...dhcpLeases } };
}
