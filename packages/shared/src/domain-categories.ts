// Category taxonomy referenced by Bible section 9 (Domain Categorization)
// and metric #9 (Domain Categories).

export const DOMAIN_CATEGORIES = [
  "search",
  "social",
  "entertainment",
  "streaming",
  "news",
  "shopping",
  "finance",
  "banking",
  "education",
  "development",
  "cloud",
  "productivity",
  "communication",
  "gaming",
  "ai",
  "advertising",
  "analytics",
  "telemetry",
  "cdn",
  "security",
  "software_updates",
  "os",
  "uncategorized",
] as const;

export type DomainCategory = (typeof DOMAIN_CATEGORIES)[number];

export type CategorySource = "auto" | "semi_auto" | "manual";

export const ECOSYSTEMS = [
  "google",
  "microsoft",
  "apple",
  "amazon",
  "meta",
  "cloudflare",
  "github",
  "openai",
  "akamai",
  "fastly",
  "other",
] as const;

export type Ecosystem = (typeof ECOSYSTEMS)[number];
