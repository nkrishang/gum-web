/**
 * Wallets offered by name when they aren't installed, in the order payers holding stablecoins most
 * often reach for them. `rdns` matches an installed extension, so a detected wallet is never
 * listed twice. How each connects:
 *
 *   walletconnect  paired over WalletConnect: its own QR code, or its app by deep link on a phone
 *                  (`mobileLink`, from the WalletConnect registry)
 *   coinbase       Coinbase's own SDK: its extension, its passkey smart wallet, or its app
 *   handoff        no in-page connection at all (Phantom speaks neither): the payment page opens
 *                  inside the wallet's app browser, where the wallet is injected, and is paid there
 */
export type PopularWallet = { name: string; rdns: string; icon: string } & (
  | { via: "walletconnect"; mobileLink: string }
  | { via: "coinbase" }
  | { via: "handoff" }
);

export const POPULAR_WALLETS: PopularWallet[] = [
  { name: "MetaMask", rdns: "io.metamask", icon: "/logos/metamask.svg", via: "walletconnect", mobileLink: "metamask://" },
  { name: "Coinbase Wallet", rdns: "com.coinbase.wallet", icon: "/logos/coinbase.svg", via: "coinbase" },
  { name: "Trust Wallet", rdns: "com.trustwallet.app", icon: "/logos/trust.svg", via: "walletconnect", mobileLink: "trust://" },
  { name: "Phantom", rdns: "app.phantom", icon: "/logos/phantom.svg", via: "handoff" },
  { name: "Rainbow", rdns: "me.rainbow", icon: "/logos/rainbow.svg", via: "walletconnect", mobileLink: "rainbow://" },
  { name: "OKX Wallet", rdns: "com.okex.wallet", icon: "/logos/okx.svg", via: "walletconnect", mobileLink: "okex://main" },
  { name: "Rabby", rdns: "io.rabby", icon: "/logos/rabby.svg", via: "walletconnect", mobileLink: "rabby://" },
];

/** Rows the wallet list fills before "Explore wallets", which is always last. */
export const WALLET_ROWS = 5;

/** Popular wallets to fill the list after the detected ones, among those this page can offer. */
export function popularFill(
  detected: { name: string; rdns?: string }[],
  available: (w: PopularWallet) => boolean = () => true,
): PopularWallet[] {
  const taken = (w: PopularWallet) =>
    detected.some(
      (d) =>
        d.rdns === w.rdns || d.name.toLowerCase().split(" ")[0] === w.name.toLowerCase().split(" ")[0],
    );
  return POPULAR_WALLETS.filter((w) => available(w) && !taken(w)).slice(0, Math.max(0, WALLET_ROWS - detected.length));
}

/** The app's WalletConnect deep link for a pairing URI (the registry's native-link format). */
export function walletDeepLink(mobileLink: string, uri: string): string {
  let base = mobileLink.includes("://") ? mobileLink : `${mobileLink.replaceAll("/", "").replaceAll(":", "")}://`;
  if (!base.endsWith("/")) base = `${base}/`;
  return `${base}wc?uri=${encodeURIComponent(uri)}`;
}

/** Opens `pageUrl` in Phantom's in-app browser (Phantom's universal link). */
export function phantomBrowseLink(pageUrl: string): string {
  const ref = new URL(pageUrl).origin;
  return `https://phantom.app/ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(ref)}`;
}

/** A wallet from WalletConnect's directory, as `/api/wallets` serves it. */
export interface RegistryWallet {
  id: string;
  name: string;
  /** Our proxy of its logo. */
  image?: string;
  /** Its app's WalletConnect deep link, when it has one. */
  mobileLink?: string;
  rdns?: string;
}

export interface WalletPage {
  count: number;
  wallets: RegistryWallet[];
}

/** "90+", "340+": rounded down to ten, so it stays true as the directory changes. */
export function walletCountLabel(count: number): string | null {
  if (count < 10) return count > 0 ? String(count) : null;
  return `${Math.floor(count / 10) * 10}+`;
}
