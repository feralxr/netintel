import nodemailer from "nodemailer";

export interface DispatchPayload {
  policyName: string;
  severity: string;
  explanation: string;
  timestamp: string;
}

/** POSTs the alert as JSON to a webhook URL. Real HTTP call, timed out, outcome always reported honestly by the caller. */
export async function dispatchWebhook(url: string, payload: DispatchPayload): Promise<{ success: boolean; message: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return { success: false, message: `webhook returned ${res.status}` };
    return { success: true, message: `webhook delivered to ${url}` };
  } catch (err) {
    return { success: false, message: `webhook failed: ${(err as Error).message}` };
  }
}

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  const host = process.env.NETINTEL_SMTP_HOST;
  const port = process.env.NETINTEL_SMTP_PORT;
  if (!host || !port) return null;

  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: process.env.NETINTEL_SMTP_SECURE === "true",
      auth:
        process.env.NETINTEL_SMTP_USER && process.env.NETINTEL_SMTP_PASS
          ? { user: process.env.NETINTEL_SMTP_USER, pass: process.env.NETINTEL_SMTP_PASS }
          : undefined,
    });
  }
  return cachedTransport;
}

/** Sends the alert as an email. Real SMTP delivery via nodemailer, requires NETINTEL_SMTP_* env vars — see .env.example. */
export async function dispatchEmail(to: string, payload: DispatchPayload): Promise<{ success: boolean; message: string }> {
  const transport = getTransport();
  if (!transport) return { success: false, message: "SMTP not configured — set NETINTEL_SMTP_HOST/PORT in .env" };

  try {
    await transport.sendMail({
      from: process.env.NETINTEL_SMTP_FROM ?? "netintel@localhost",
      to,
      subject: `netintel alert: ${payload.policyName}`,
      text: `Severity: ${payload.severity}\nTime: ${payload.timestamp}\n\n${payload.explanation}`,
    });
    return { success: true, message: `email sent to ${to}` };
  } catch (err) {
    return { success: false, message: `email failed: ${(err as Error).message}` };
  }
}

/** Dispatches to every configured channel on a policy. Returns per-channel outcomes so the caller can report honestly. */
export async function dispatchToChannels(
  channels: string[],
  payload: DispatchPayload
): Promise<{ channel: string; success: boolean; message: string }[]> {
  const results: { channel: string; success: boolean; message: string }[] = [];

  for (const channel of channels) {
    if (channel === "in_app") continue; // handled separately via emitNotification, not a dispatch target
    if (channel.startsWith("webhook:")) {
      const url = channel.slice("webhook:".length);
      const result = await dispatchWebhook(url, payload);
      results.push({ channel, ...result });
    } else if (channel.startsWith("email:")) {
      const to = channel.slice("email:".length);
      const result = await dispatchEmail(to, payload);
      results.push({ channel, ...result });
    }
  }
  return results;
}
