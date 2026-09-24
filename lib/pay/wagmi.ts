import { fallback, http, type Chain, type Transport } from "viem";
import {
  abstract,
  apeChain,
  avalanche,
  berachain,
  blast,
  bsc,
  celo,
  gnosis,
  hyperEvm,
  ink,
  katana,
  linea,
  mainnet,
  mantle,
  mode,
  optimism,
  plumeMainnet,
  polygon,
  scroll,
  soneium,
  sonic,
  unichain,
  worldchain,
  zkSync,
  zora,
} from "viem/chains";
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
export const RPC_OVERRIDES: Record<number, string | undefined> = {
  8453: process.env.NEXT_PUBLIC_RPC_URL_8453,
  42161: process.env.NEXT_PUBLIC_RPC_URL_42161,
  143: process.env.NEXT_PUBLIC_RPC_URL_143,
  5042: process.env.NEXT_PUBLIC_RPC_URL_5042,
};

/**
 * Chains a payer may pay *from* through a Relay route, beyond the page's own. Listed so that a
 * WalletConnect session asks the phone wallet for them too (its optional namespaces come from this
 * config); browser wallets switch to any chain regardless. Relay routes from more than these; a
 * phone wallet paired without a chain can still pay from the ones it has.
 */
const ROUTE_CHAINS: Chain[] = [
  mainnet, optimism, bsc, polygon, avalanche, gnosis, linea, scroll, zkSync, blast, mantle, celo, zora, unichain, sonic,
  worldchain, ink, soneium, berachain, hyperEvm, mode, abstract, katana, plumeMainnet, apeChain,
];
const CHAINS = [...PAY_CHAINS, ...ROUTE_CHAINS.filter((c) => !PAY_CHAINS.some((p) => p.id === c.id))] as [Chain, ...Chain[]];

const transports = Object.fromEntries(
  CHAINS.map((chain): [number, Transport] => {
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
  chains: CHAINS,
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
