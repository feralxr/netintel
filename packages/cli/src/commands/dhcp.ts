import chalk from "chalk";
import { apiGet } from "../api-client.js";
import { section, table, stat, noDataNote } from "../output.js";

interface LeaseChurnDay {
  date: string;
  new: number;
  renewed: number;
  ipChanged: number;
  expired: number;
}
interface LeaseDuration {
  hasData: boolean;
  note: string | null;
  avgHours?: number;
  medianHours?: number;
}
interface IpContinuity {
  genuinelyNewDevices: number;
  returningDevices: number;
  returningShare: number;
}
interface ActivityGapEntry {
  mac: string;
  ipAddress: string;
  leaseObtained: string;
  gapMinutes: number | null;
}

export async function dhcpCommand(): Promise<void> {
  const [churn, duration, continuity, activityGap] = await Promise.all([
    apiGet<LeaseChurnDay[]>("/api/dhcp/lease-churn"),
    apiGet<LeaseDuration>("/api/dhcp/lease-duration"),
    apiGet<IpContinuity>("/api/dhcp/ip-continuity"),
    apiGet<ActivityGapEntry[]>("/api/dhcp/activity-gap"),
  ]);

  console.log(chalk.bold("\nDHCP overview\n"));
  stat("Returning device share", `${(continuity.returningShare * 100).toFixed(1)}%`);
  stat("Genuinely new devices", continuity.genuinelyNewDevices);
  stat("Avg lease duration", duration.hasData && duration.avgHours !== undefined ? `${duration.avgHours.toFixed(1)}h` : "no data yet");

  section("Lease churn by day");
  table(churn.slice(-14), [
    { key: "date", label: "Date" },
    { key: "new", label: "New" },
    { key: "renewed", label: "Renewed" },
    { key: "ipChanged", label: "IP changed" },
    { key: "expired", label: "Expired" },
  ]);

  section("DHCP-to-DNS activity gap");
  table(
    activityGap.slice(0, 10).map((g) => ({ ipAddress: g.ipAddress, leaseObtained: new Date(g.leaseObtained).toLocaleString(), gapMinutes: g.gapMinutes !== null ? g.gapMinutes.toFixed(0) : "–" })),
    [
      { key: "ipAddress", label: "IP" },
      { key: "leaseObtained", label: "Lease obtained" },
      { key: "gapMinutes", label: "Minutes to first DNS query" },
    ]
  );

  noDataNote(duration.note);
  console.log();
}
