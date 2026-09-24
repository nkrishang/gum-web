/** Public (browser-safe) configuration. Server-only values live in lib/server-env.ts. */

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const privyClientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ?? "";

/** WalletConnect Cloud project id. Without it the pay page offers browser wallets only. */
export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

/** Where the site is served, for absolute links (the pay page's WalletConnect metadata). */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gum.money").replace(/\/+$/, "");

/** Shown in docs snippets and links. The dashboard itself talks to the API through /api/gum. */
export const publicApiUrl = process.env.NEXT_PUBLIC_GUM_API_URL ?? "https://api.gum.money";

export const links = {
  docs: "https://github.com/nkrishang/gum-server#api",
  server: "https://github.com/nkrishang/gum-server",
  contracts: "https://github.com/nkrishang/gum-contracts",
  github: "https://github.com/nkrishang",
};
