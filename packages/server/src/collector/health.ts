// Tracks real Technitium reachability so /api/status reflects actual
// collector health instead of a hardcoded value. Updated by poller.ts on
// every poll attempt.

let reachable = false;
let lastError: string | null = null;

export function setTechnitiumHealth(isReachable: boolean, error?: string): void {
  reachable = isReachable;
  lastError = isReachable ? null : (error ?? lastError);
}

export function getTechnitiumHealth(): { reachable: boolean; lastError: string | null } {
  return { reachable, lastError };
}
