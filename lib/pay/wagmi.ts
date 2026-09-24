import { fallback, http, type Transport } from "viem";
import { createConfig } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { walletConnectProjectId } from "@/lib/env";
import { PAY_CHAINS } from "./networks";

/**
 * The pay widget's wallet stack. Browser extensions arrive on their own through EIP-6963
 * discovery, one connector per installed wallet, so the picker lists what the payer actually has.
 * WalletConnect joins when a project id is configured and covers phone wallets; its own modal is
 * off, and the widget shows the pairing QR code or deep link itself. Reads (balances, receipts) go through our transports; the transfer itself is
 * sent by the wallet on its own RPC.
 */

// Inlined at build time, so each name is spelled out.
const RPC_OVERRIDES: Record<number, string | undefined> = {
  8453: process.env.NEXT_PUBLIC_RPC_URL_8453,
  42161: process.env.NEXT_PUBLIC_RPC_URL_42161,
  143: process.env.NEXT_PUBLIC_RPC_URL_143,
  5042: process.env.NEXT_PUBLIC_RPC_URL_5042,
};

const transports = Object.fromEntries(
  PAY_CHAINS.map((chain): [number, Transport] => {
    const override = RPC_OVERRIDES[chain.id];
    return [chain.id, override ? fallback([http(override), http()]) : http()];
  }),
);

export const hasWalletConnect = walletConnectProjectId.length > 0;

// WalletConnect opens browser storage as soon as its connector is set up, which wagmi does when the
// config is created, so it only joins in the browser. The widget lists wallets after mount, so the
// server's markup never depends on it.
const inBrowser = typeof window !== "undefined";

export const payWagmiConfig = createConfig({
  chains: PAY_CHAINS,
  transports,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected({ shimDisconnect: true }),
    // Coinbase's SDK: its extension when installed, else a popup offering its passkey smart wallet
    // or its app. Loaded on first use.
    coinbaseWallet({ appName: "Gum", appLogoUrl: inBrowser ? `${window.location.origin}/icon1.png` : undefined }),
    ...(hasWalletConnect && inBrowser
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            // The page draws its own wallet list, QR codes and deep links from the pairing URI.
            showQrModal: false,
            // The page's own origin: WalletConnect warns (and some wallets balk) when it differs.
            metadata: {
              name: "Gum",
              description: "Pay a Gum deposit request",
              url: window.location.origin,
              icons: [`${window.location.origin}/icon1.png`],
            },
          }),
        ]
      : []),
  ],
});
