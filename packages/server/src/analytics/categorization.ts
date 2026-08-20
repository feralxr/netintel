import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { domainCategories } from "../db/schema.js";
import type { DomainCategory, Ecosystem } from "@netintel/shared";

// v1 auto-classifier: a curated static dictionary. This is intentionally the
// single place category knowledge lives so it can be swapped for a real
// maintained blocklist/category feed later without touching callers.
// Matches are tried on the exact domain first, then the registered domain.

const EXACT_MATCHES: Record<string, DomainCategory> = {
  "doubleclick.net": "advertising",
  "googlesyndication.com": "advertising",
  "googleadservices.com": "advertising",
  "google-analytics.com": "analytics",
  "googletagmanager.com": "analytics",
  "windowsupdate.com": "software_updates",
  "update.microsoft.com": "software_updates",
  "swscan.apple.com": "software_updates",
  "mesu.apple.com": "software_updates",
};

const REGISTERED_DOMAIN_MATCHES: Record<string, DomainCategory> = {
  "google.com": "search",
  "youtube.com": "streaming",
  "netflix.com": "streaming",
  "spotify.com": "streaming",
  "twitch.tv": "streaming",
  "instagram.com": "social",
  "facebook.com": "social",
  "reddit.com": "social",
  "discord.com": "communication",
  "slack.com": "communication",
  "github.com": "development",
  "gitlab.com": "development",
  "npmjs.com": "development",
  "cloudflare.com": "cloud",
  "amazonaws.com": "cloud",
  "azure.com": "cloud",
  "microsoft.com": "os",
  "apple.com": "os",
  "icloud.com": "cloud",
  "amazon.com": "shopping",
  "ebay.com": "shopping",
  "paypal.com": "finance",
  "chase.com": "banking",
  "wikipedia.org": "education",
  "coursera.org": "education",
  "openai.com": "ai",
  "chatgpt.com": "ai",
  "anthropic.com": "ai",
  "steamcommunity.com": "gaming",
  "steampowered.com": "gaming",
  "nytimes.com": "news",
  "bbc.co.uk": "news",
};

const TRACKER_CATEGORIES: DomainCategory[] = ["advertising", "analytics", "telemetry"];

export function classifyDomain(domain: string, registeredDomain: string): { category: DomainCategory; confidence: number } {
  if (EXACT_MATCHES[domain]) return { category: EXACT_MATCHES[domain], confidence: 0.95 };
  if (REGISTERED_DOMAIN_MATCHES[registeredDomain]) return { category: REGISTERED_DOMAIN_MATCHES[registeredDomain], confidence: 0.85 };
  return { category: "uncategorized", confidence: 0 };
}

/** Classifies and stores a domain's category if it hasn't been categorized yet (auto-tier only; never overwrites manual/semi_auto). */
export function ensureCategorized(domain: string, registeredDomain: string): void {
  const existing = db.select().from(domainCategories).where(eq(domainCategories.domain, domain)).get();
  if (existing) return; // manual/semi_auto/previous-auto assignments are never silently overwritten

  const { category, confidence } = classifyDomain(domain, registeredDomain);
  if (category === "uncategorized") return; // don't clutter the table with unresolved guesses

  db.insert(domainCategories)
    .values({ domain, category, confidence, source: "auto", updatedAt: new Date().toISOString() })
    .run();
}

export function isTrackerCategory(category: string | null): boolean {
  return category !== null && TRACKER_CATEGORIES.includes(category as DomainCategory);
}

// -----------------------------------------------------------------------
// Ecosystem mapping — Bible metric #36 (Ecosystem Analysis), #37
// (Infrastructure Dependency). Same "static dictionary as v1 auto-tier"
// approach as domain categories above.
// -----------------------------------------------------------------------
const ECOSYSTEM_MATCHES: Record<string, Ecosystem> = {
  "google.com": "google",
  "youtube.com": "google",
  "googlesyndication.com": "google",
  "googleadservices.com": "google",
  "google-analytics.com": "google",
  "googletagmanager.com": "google",
  "gstatic.com": "google",
  "doubleclick.net": "google",
  "microsoft.com": "microsoft",
  "windowsupdate.com": "microsoft",
  "office.com": "microsoft",
  "live.com": "microsoft",
  "xbox.com": "microsoft",
  "apple.com": "apple",
  "icloud.com": "apple",
  "swscan.apple.com": "apple",
  "mesu.apple.com": "apple",
  "amazon.com": "amazon",
  "amazonaws.com": "amazon",
  "amazontrust.com": "amazon",
  "facebook.com": "meta",
  "instagram.com": "meta",
  "whatsapp.com": "meta",
  "fbcdn.net": "meta",
  "cloudflare.com": "cloudflare",
  "cloudflare.net": "cloudflare",
  "github.com": "github",
  "githubusercontent.com": "github",
  "githubassets.com": "github",
  "openai.com": "openai",
  "chatgpt.com": "openai",
};

export function ecosystemFor(registeredDomain: string): Ecosystem {
  return ECOSYSTEM_MATCHES[registeredDomain] ?? "other";
}

// Infrastructure layer — Bible metric #37. Reuses the category taxonomy:
// a domain's category maps fairly directly onto an infrastructure role.
const INFRASTRUCTURE_LAYER: Record<string, string> = {
  cdn: "cdn",
  cloud: "cloud_hosting",
  security: "dns",
  analytics: "analytics",
  advertising: "advertising",
  development: "api",
  productivity: "storage",
};

export function infrastructureLayerFor(category: string | null): string | null {
  if (!category) return null;
  return INFRASTRUCTURE_LAYER[category] ?? null;
}
