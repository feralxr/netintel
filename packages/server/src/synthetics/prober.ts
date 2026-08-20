import dns from "node:dns";
import { performance } from "node:perf_hooks";

export interface ProbeResult {
  success: boolean;
  responseTimeMs: number | null;
  resolvedIp: string | null;
  errorMessage: string | null;
}

// Preset resolver labels a user can pick without typing an IP. "technitium"
// resolves from NETINTEL_TECHNITIUM_URL's hostname — same instance the
// collector talks to, but this hits its actual DNS port (53), not the HTTP
// API port, since this is a *network* probe, not an API call.
const RESOLVER_PRESETS: Record<string, string> = {
  cloudflare: "1.1.1.1",
  google: "8.8.8.8",
  quad9: "9.9.9.9",
};

export function resolveResolverIp(resolverLabel: string): string {
  if (RESOLVER_PRESETS[resolverLabel]) return RESOLVER_PRESETS[resolverLabel];
  if (resolverLabel === "technitium") {
    const url = process.env.NETINTEL_TECHNITIUM_URL;
    if (url) {
      try {
        return new URL(url).hostname;
      } catch {
        // fall through to default below
      }
    }
    return "127.0.0.1";
  }
  return resolverLabel; // anything else is treated as a raw IP the user supplied directly
}

/** Performs one real DNS resolution against the given resolver and measures actual wall-clock latency. Not simulated. */
export async function probe(targetDomain: string, resolverLabel: string, timeoutMs = 5000): Promise<ProbeResult> {
  const ip = resolveResolverIp(resolverLabel);
  const resolver = new dns.promises.Resolver({ timeout: timeoutMs });
  resolver.setServers([ip]);

  const start = performance.now();
  try {
    const addresses = await resolver.resolve4(targetDomain);
    const responseTimeMs = performance.now() - start;
    return { success: true, responseTimeMs, resolvedIp: addresses[0] ?? null, errorMessage: null };
  } catch (err) {
    const responseTimeMs = performance.now() - start;
    return { success: false, responseTimeMs, resolvedIp: null, errorMessage: (err as Error).message };
  }
}
