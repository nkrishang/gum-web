/**
 * Paying with any token on any chain: gum-server's `/v1/pay/{id}/sources`, `/quote` and
 * `/routes`, backed by Relay (relay.link). gum-server pins every route's destination to the
 * deposit (its chain, its token, the exact amount, the payment address) and checks Relay's answer
 * before the page sees it; the page only chooses what to pay with. Amounts are base-unit strings.
 */

export const NATIVE = "0x0000000000000000000000000000000000000000";

export interface SourceToken {
  /** Lowercase. The zero address is the chain's native currency. */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo_uri?: string;
}

export interface SourceChain {
  id: number;
  name: string;
  icon_url: string | null;
  explorer_url: string;
  /** Relay's public RPC, for balance reads and for adding the network to a wallet. */
  rpc_url: string;
  multicall3?: string;
  native: SourceToken;
  /** An ERC-20 that is the same balance as the native currency (Arc's USDC): listed instead of it. */
  native_alias?: string;
  tokens: SourceToken[];
}

export interface Sources {
  available: boolean;
  reason?: "disabled" | "destination_unsupported" | "closed";
  /** EVM chains Relay routes from, the deposit's own first. */
  chains: SourceChain[];
}

export interface FoundToken extends SourceToken {
  chain_id: number;
}

export interface RouteAmount {
  chain_id: number;
  currency: SourceToken;
  amount: string;
  amount_usd?: string;
}

/** One origin-chain transaction, in order: an approval, then the deposit into Relay. */
export interface RouteStep {
  id: string;
  description: string;
  chain_id: number;
  to: string;
  data: string;
  /** Wei, decimal. */
  value: string;
}

export interface RouteQuote {
  request_id: string;
  quoted_at: string;
  origin: RouteAmount;
  /** Exactly what the payment address receives. */
  destination: RouteAmount;
  fees: { route_usd?: string; gas?: RouteAmount };
  time_estimate_secs?: number;
  steps: RouteStep[];
}

export type RouteState = "waiting" | "depositing" | "pending" | "submitted" | "success" | "failure" | "refund" | "unknown";

export interface RouteStatus {
  request_id: string;
  status: RouteState | (string & {});
  /** Origin transactions. */
  in_tx_hashes: string[];
  /** Destination transactions: the fill into the payment address. */
  tx_hashes: string[];
  fail_reason?: string;
  updated_at?: string;
}

export function isFinal(status: RouteStatus["status"]): boolean {
  return status === "success" || status === "failure" || status === "refund";
}

/** How Relay spells a token: `<chain id>:<address>`. */
export function assetKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

export function relayTxUrl(requestId: string): string {
  return `https://relay.link/transaction/${requestId}`;
}
