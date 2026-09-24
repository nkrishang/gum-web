import { getAddress, isAddress, type Address, type Chain } from "viem";
import { arbitrum, base, monad } from "viem/chains";
import type { PayDeposit } from "./types";

/**
 * The networks and tokens the pay widget will build a transfer for. Mirrors gum-server's chain
 * registry (config/default.toml). A deposit is only payable from a connected wallet when its
 * chain, token contract and decimals all match an entry here, so a wrong or tampered response
 * can never get a signature for an unexpected asset, chain or scale. Scanning and copying still
 * work for anything the API returns; the page just cannot vouch for it.
 */

export interface PayToken {
  symbol: string;
  address: Address;
  decimals: number;
  icon: string;
}

export interface PayNetwork {
  chain: Chain;
  name: string;
  slug: string;
  icon: string;
  nativeSymbol: string;
  explorer: string;
  /** Roughly how long a block takes, for "usually confirms in" copy. */
  blockTimeMs: number;
  tokens: PayToken[];
}

const USDC_ICON = "/payment-icons/usdc.svg";
const USDT_ICON = "/payment-icons/usdt.svg";
const AUSD_ICON = "/payment-icons/ausd.svg";

export const NETWORKS: Record<number, PayNetwork> = {
  [base.id]: {
    chain: base,
    name: "Base",
    slug: "base",
    icon: "/logos/base.svg",
    nativeSymbol: "ETH",
    explorer: "https://basescan.org",
    blockTimeMs: 2_000,
    tokens: [
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, icon: USDC_ICON },
    ],
  },
  [arbitrum.id]: {
    chain: arbitrum,
    name: "Arbitrum",
    slug: "arbitrum",
    icon: "/logos/arbitrum.svg",
    nativeSymbol: "ETH",
    explorer: "https://arbiscan.io",
    blockTimeMs: 250,
    tokens: [
      { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, icon: USDC_ICON },
      { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6, icon: USDT_ICON },
    ],
  },
  [monad.id]: {
    chain: monad,
    name: "Monad",
    slug: "monad",
    icon: "/payment-icons/monad.svg",
    nativeSymbol: "MON",
    explorer: "https://monadscan.com",
    blockTimeMs: 400,
    tokens: [
      { symbol: "USDC", address: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", decimals: 6, icon: USDC_ICON },
      { symbol: "USDT", address: "0xe7cd86e13AC4309349F30B3435a9d337750fC82D", decimals: 6, icon: USDT_ICON },
      { symbol: "AUSD", address: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a", decimals: 6, icon: AUSD_ICON },
    ],
  },
};

export const PAY_CHAINS = Object.values(NETWORKS).map((n) => n.chain) as [Chain, ...Chain[]];

export function networkBySlug(slug: string): PayNetwork | null {
  return Object.values(NETWORKS).find((n) => n.slug === slug.toLowerCase()) ?? null;
}

const TOKEN_ICONS: Record<string, string> = { USDC: USDC_ICON, USDT: USDT_ICON, AUSD: AUSD_ICON };

/** What the page knows about a deposit's asset, and whether it can pay it from a wallet. */
export type ResolvedAsset =
  | { verified: true; network: PayNetwork; token: PayToken; paymentAddress: Address }
  | {
      verified: false;
      network: PayNetwork | null;
      /** Display-only facts, straight from the API. */
      chainName: string;
      tokenIcon: string | null;
      reason: string;
    };

export function resolveAsset(deposit: Pick<PayDeposit, "chain_id" | "token" | "token_address" | "token_decimals" | "payment_address">): ResolvedAsset {
  const network = NETWORKS[deposit.chain_id] ?? null;
  const chainName = network?.name ?? `chain ${deposit.chain_id}`;
  const tokenIcon = TOKEN_ICONS[deposit.token.toUpperCase()] ?? null;
  const fail = (reason: string): ResolvedAsset => ({ verified: false, network, chainName, tokenIcon, reason });

  if (!network) return fail(`This page does not support ${chainName}.`);
  if (!isAddress(deposit.payment_address, { strict: false })) return fail("The payment address is malformed.");
  if (!isAddress(deposit.token_address, { strict: false })) return fail("The token contract is malformed.");
  const token = network.tokens.find((t) => t.address.toLowerCase() === deposit.token_address.toLowerCase());
  if (!token) return fail(`${deposit.token} at ${deposit.token_address} is not a token this page knows on ${network.name}.`);
  if (token.symbol !== deposit.token.toUpperCase() || token.decimals !== deposit.token_decimals) {
    return fail(`The token details do not match ${token.symbol} on ${network.name}.`);
  }
  return { verified: true, network, token, paymentAddress: getAddress(deposit.payment_address) };
}

/**
 * An EIP-681 payment request: `ethereum:<token>@<chainId>/transfer?address=<to>&uint256=<amount>`.
 * A wallet that reads it pre-fills the network, the token, the recipient and the exact amount, so
 * the payer has nothing to choose and nothing to type.
 */
export function eip681(args: { chainId: number; token: string; to: string; amount: bigint }): string {
  return `ethereum:${args.token}@${args.chainId}/transfer?address=${args.to}&uint256=${args.amount.toString()}`;
}

export function explorerTx(network: PayNetwork | null, hash: string): string | null {
  return network ? `${network.explorer}/tx/${hash}` : null;
}

export function explorerAddress(network: PayNetwork | null, address: string): string | null {
  return network ? `${network.explorer}/address/${address}` : null;
}
