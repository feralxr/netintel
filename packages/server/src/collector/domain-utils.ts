// Lightweight registered-domain (eTLD+1) extraction.
//
// v1 note: this uses a simple two-label heuristic plus a short list of common
// compound TLDs (co.uk, com.au, etc). It is NOT a full Public Suffix List
// implementation. Good enough for dashboard grouping in v1; swap in the
// `psl` npm package (or a vendored public suffix list) in a later version if
// categorization accuracy on compound-TLD domains matters more.

const COMPOUND_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk",
  "com.au", "net.au", "org.au",
  "co.jp", "co.in", "co.nz",
  "com.br", "com.mx",
]);

export function normalizeDomain(raw: string): string {
  return raw.trim().replace(/\.$/, "").toLowerCase();
}

export function registeredDomain(raw: string): string {
  const domain = normalizeDomain(raw);
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;

  const lastTwo = parts.slice(-2).join(".");
  if (COMPOUND_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

export function subdomain(raw: string): string {
  const domain = normalizeDomain(raw);
  const reg = registeredDomain(domain);
  if (domain === reg) return "";
  return domain.slice(0, domain.length - reg.length - 1);
}
