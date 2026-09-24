/**
 * Wallets offered by name when they aren't installed, reached over WalletConnect. The ones payers
 * holding stablecoins most often use, that pair over WalletConnect (Coinbase's and Phantom's apps
 * use their own SDKs instead). `rdns` matches an installed extension, so a detected wallet is never
 * listed twice; `mobileLink` is the app's WalletConnect deep link, from the WalletConnect registry.
 */
export interface PopularWallet {
  name: string;
  rdns: string;
  icon: string;
  mobileLink: string;
}

export const POPULAR_WALLETS: PopularWallet[] = [
  { name: "MetaMask", rdns: "io.metamask", icon: "/logos/metamask.svg", mobileLink: "metamask://" },
  { name: "Trust Wallet", rdns: "com.trustwallet.app", icon: "/logos/trust.svg", mobileLink: "trust://" },
  { name: "Rainbow", rdns: "me.rainbow", icon: "/logos/rainbow.svg", mobileLink: "rainbow://" },
  { name: "OKX Wallet", rdns: "com.okex.wallet", icon: "/logos/okx.svg", mobileLink: "okex://main" },
  { name: "Rabby", rdns: "io.rabby", icon: "/logos/rabby.svg", mobileLink: "rabby://" },
];

/** Rows the wallet list fills before "Explore wallets", which is always last. */
export const WALLET_ROWS = 5;

/** Popular wallets to fill the list after the detected ones. */
export function popularFill(detected: { name: string; rdns?: string }[]): PopularWallet[] {
  const taken = (w: PopularWallet) =>
    detected.some(
      (d) =>
        d.rdns === w.rdns || d.name.toLowerCase().split(" ")[0] === w.name.toLowerCase().split(" ")[0],
    );
  return POPULAR_WALLETS.filter((w) => !taken(w)).slice(0, Math.max(0, WALLET_ROWS - detected.length));
}

/** The app's WalletConnect deep link for a pairing URI (the registry's native-link format). */
export function walletDeepLink(mobileLink: string, uri: string): string {
  let base = mobileLink.includes("://") ? mobileLink : `${mobileLink.replaceAll("/", "").replaceAll(":", "")}://`;
  if (!base.endsWith("/")) base = `${base}/`;
  return `${base}wc?uri=${encodeURIComponent(uri)}`;
}
