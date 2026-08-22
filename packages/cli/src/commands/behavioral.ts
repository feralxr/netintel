import chalk from "chalk";
import { apiGet } from "../api-client.js";
import { section, table, stat } from "../output.js";

interface SearchVsDirect {
  search: { queries: number; share: number };
  social: { queries: number; share: number };
  content: { queries: number; share: number };
  directNavigation: { queries: number; share: number };
}
interface PeriodicDomain {
  domain: string;
  periodicityScore: number;
  sampleSize: number;
}
interface BackgroundVsInteractive {
  backgroundDomainCount: number;
  interactiveDomainCount: number;
  backgroundQueryShare: number;
  topBackgroundDomains: PeriodicDomain[];
}
interface InternetRoutine {
  weekdayQueries: number;
  weekendQueries: number;
  weekdayVsWeekendRatio: number | null;
  highActivityHours: number[];
  peakHour: number;
}
interface SessionOverlap {
  maxConcurrentDevices: number;
  overlapWindowCount: number;
}
interface SequenceFingerprint {
  sequence: string;
  occurrences: number;
}

export async function behavioralCommand(): Promise<void> {
  const [searchVsDirect, periodic, backgroundVsInteractive, routine, sessionOverlap, sequences] = await Promise.all([
    apiGet<SearchVsDirect>("/api/behavioral/search-vs-direct"), // #39
    apiGet<PeriodicDomain[]>("/api/behavioral/periodicity"), // #41
    apiGet<BackgroundVsInteractive>("/api/behavioral/background-vs-interactive"), // #40
    apiGet<InternetRoutine>("/api/behavioral/routine"), // #46
    apiGet<SessionOverlap>("/api/behavioral/session-overlap"), // #78
    apiGet<SequenceFingerprint[]>("/api/behavioral/sequence-fingerprints"), // #79
  ]);

  console.log(chalk.bold("\nBehavioral overview\n"));
  stat("Peak hour (UTC)", `${routine.peakHour}:00`, 28);
  stat("Weekday vs weekend ratio", routine.weekdayVsWeekendRatio !== null ? routine.weekdayVsWeekendRatio.toFixed(2) : "no weekend data yet", 28);
  stat("Background traffic share", `${(backgroundVsInteractive.backgroundQueryShare * 100).toFixed(1)}%`, 28);
  stat("Max concurrent devices", sessionOverlap.maxConcurrentDevices, 28);

  section("Search / social / content / direct navigation split (DNS-only approximation)");
  table(
    [
      { kind: "Search", ...searchVsDirect.search },
      { kind: "Social", ...searchVsDirect.social },
      { kind: "Content", ...searchVsDirect.content },
      { kind: "Direct navigation", ...searchVsDirect.directNavigation },
    ],
    [
      { key: "kind", label: "Kind" },
      { key: "queries", label: "Queries" },
      { key: "share", label: "Share", format: (v) => `${((v as number) * 100).toFixed(1)}%` },
    ]
  );

  section("Most periodic domains (candidate background/telemetry traffic)");
  table(periodic.slice(0, 10), [
    { key: "domain", label: "Domain" },
    { key: "periodicityScore", label: "Periodicity" },
    { key: "sampleSize", label: "Samples" },
  ]);

  section("Recurring domain sequences");
  table(sequences.slice(0, 10), [
    { key: "sequence", label: "Sequence" },
    { key: "occurrences", label: "Occurrences" },
  ]);

  console.log();
}
