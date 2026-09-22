import "server-only";

/** Base URL of gum-server. Never exposed to the browser; the dashboard proxies through /api/gum. */
export const gumApiUrl = (process.env.GUM_API_URL ?? "https://api.gum.money").replace(/\/+$/, "");
