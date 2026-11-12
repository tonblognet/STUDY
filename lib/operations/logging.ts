type ErrorContext = {
  routePath: string;
  routerKind: string;
  routeType: string;
};

function routeGroup(path: string) {
  for (const group of ["auth", "account", "admin", "support", "webhooks"])
    if (path.startsWith(`/api/${group}/`)) return `/api/${group}/*`;
  if (path.startsWith("/api/")) return "/api/*";
  for (const group of ["account", "admin", "programs", "universities"])
    if (path === `/${group}` || path.startsWith(`/${group}/`))
      return `/${group}/*`;
  return "public_page";
}

/** Deliberate allowlist. Never serialize Error/request/headers or their text. */
export function serverFailureEvent(
  error: unknown,
  context: ErrorContext,
  now = new Date(),
) {
  return {
    event: "SERVER_REQUEST_FAILURE",
    at: now.toISOString(),
    routeGroup: routeGroup(context.routePath),
    router:
      context.routerKind === "App Router"
        ? "app"
        : context.routerKind === "Pages Router"
          ? "pages"
          : "unknown",
    operation: ["render", "route", "action", "proxy"].includes(
      context.routeType,
    )
      ? context.routeType
      : "unknown",
    errorType:
      error instanceof TypeError
        ? "TypeError"
        : error instanceof RangeError
          ? "RangeError"
          : error instanceof Error
            ? "Error"
            : "Unknown",
  };
}
