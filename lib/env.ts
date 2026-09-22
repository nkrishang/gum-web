/** Public (browser-safe) configuration. Server-only values live in lib/server-env.ts. */

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";

/** Shown in docs snippets and links. The dashboard itself talks to the API through /api/gum. */
export const publicApiUrl = process.env.NEXT_PUBLIC_GUM_API_URL ?? "https://api.gum.money";

export const links = {
  docs: "https://github.com/nkrishang/gum-server#api",
  server: "https://github.com/nkrishang/gum-server",
  contracts: "https://github.com/nkrishang/gum-contracts",
  github: "https://github.com/nkrishang",
};
