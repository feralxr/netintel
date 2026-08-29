import path from "node:path";
import fs from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

// Resolved relative to process.cwd() — @hono/node-server's serveStatic
// explicitly doesn't support absolute paths for `root`. Both packaging
// installs (packaging/linux/netintel.service's WorkingDirectory and
// packaging/windows/install.ps1's AppDirectory) and `npm run dev:server`
// all set cwd to packages/server, so this relative path is reliable
// across dev and both production service installs without needing an
// env var — see docs/SETUP.md if you're running from a different cwd.
const WEB_DIST_RELATIVE = "../../apps/web/dist";
const WEB_DIST_ABSOLUTE = path.resolve(process.cwd(), WEB_DIST_RELATIVE);

export function mountWebDashboard(app: Hono): { mounted: boolean; distPath: string } {
  const indexPath = path.join(WEB_DIST_ABSOLUTE, "index.html");
  if (!fs.existsSync(indexPath)) {
    // Not a fatal error — the API still works standalone, and this is the
    // expected state before `npm run build -w @netintel/web` has ever run.
    return { mounted: false, distPath: WEB_DIST_ABSOLUTE };
  }

  const indexHtml = fs.readFileSync(indexPath, "utf-8");

  // Static assets (JS/CSS/images) — real files get served with correct
  // content-types and caching headers by serveStatic.
  app.use("/*", serveStatic({ root: WEB_DIST_RELATIVE }));

  // SPA fallback: any GET that reaches here didn't match a real static
  // file or an /api or /ws route (both are mounted before this in
  // app.ts), so it's a client-side route (e.g. /domains/example.com) —
  // serve index.html and let the router in the browser take over.
  app.get("*", (c) => c.html(indexHtml));

  return { mounted: true, distPath: WEB_DIST_ABSOLUTE };
}
