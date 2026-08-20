import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from "@tanstack/react-router";
import { OverviewPage } from "./routes/Overview";

// Overview is the landing page — kept in the main bundle for fast first
// paint. Everything else code-splits into its own chunk, loaded on
// navigation, so a visit that only ever looks at Overview doesn't pay for
// Domains/Security/Performance/History's code (or their chart deps).

const rootRoute = createRootRoute();

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: OverviewPage });

const networkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/network",
  component: lazyRouteComponent(() => import("./routes/Network").then((m) => ({ default: m.NetworkPage }))),
});

const domainsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/domains",
  component: lazyRouteComponent(() => import("./routes/Domains").then((m) => ({ default: m.DomainsPage }))),
});

const domainDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/domains/$domain",
  component: lazyRouteComponent(() => import("./routes/DomainDetail").then((m) => ({ default: m.DomainDetailPage }))),
});

const securityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/security",
  component: lazyRouteComponent(() => import("./routes/Security").then((m) => ({ default: m.SecurityPage }))),
});

const performanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/performance",
  component: lazyRouteComponent(() => import("./routes/Performance").then((m) => ({ default: m.PerformancePage }))),
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: lazyRouteComponent(() => import("./routes/History").then((m) => ({ default: m.HistoryPage }))),
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  component: lazyRouteComponent(() => import("./routes/RelationshipMap").then((m) => ({ default: m.RelationshipMapPage }))),
});

const explorerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/explorer",
  component: lazyRouteComponent(() => import("./routes/Explorer").then((m) => ({ default: m.ExplorerPage }))),
});

const dashboardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboards",
  component: lazyRouteComponent(() => import("./routes/Dashboards").then((m) => ({ default: m.DashboardsPage }))),
});

const dashboardDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboards/$id",
  component: lazyRouteComponent(() => import("./routes/DashboardDetail").then((m) => ({ default: m.DashboardDetailPage }))),
});

const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alerts",
  component: lazyRouteComponent(() => import("./routes/Alerts").then((m) => ({ default: m.AlertsPage }))),
});

const syntheticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/synthetics",
  component: lazyRouteComponent(() => import("./routes/Synthetics").then((m) => ({ default: m.SyntheticsPage }))),
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  networkRoute,
  domainsRoute,
  domainDetailRoute,
  securityRoute,
  performanceRoute,
  historyRoute,
  mapRoute,
  explorerRoute,
  dashboardsRoute,
  dashboardDetailRoute,
  alertsRoute,
  syntheticsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
