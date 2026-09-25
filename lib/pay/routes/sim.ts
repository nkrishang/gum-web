import type { Simulator } from "@/lib/pay/simulator";
import type { RoutesClient } from "./client";
import { RouteError } from "./client";
import { NATIVE, type FoundToken, type RouteQuote, type SourceChain, type SourceToken } from "./types";

/**
 * Test mode's Relay: a handful of chains and tokens, round-number prices, quotes priced like
 * Relay's (the amount at the token's price, plus a few cents and 0.1%), and routes that the
 * simulator fills from Relay's solver a couple of seconds after they're sent.
 */

const ICON = (id: number) => `https://assets.relay.link/icons/${id}/light.png`;
const USDC: Omit<SourceToken, "address"> = { symbol: "USDC", name: "USD Coin", decimals: 6, logo_uri: "/payment-icons/usdc.svg" };
const USDT: Omit<SourceToken, "address"> = { symbol: "USDT", name: "Tether USD", decimals: 6, logo_uri: "/payment-icons/usdt.svg" };
const ETH: SourceToken = { address: NATIVE, symbol: "ETH", name: "Ether", decimals: 18, logo_uri: ICON(1) };

const chain = (id: number, name: string, native: SourceToken, tokens: SourceToken[], icon = ICON(id)): SourceChain => ({
  id,
  name,
  icon_url: icon,
  explorer_url: "https://example.invalid",
  rpc_url: "https://example.invalid",
  native,
  tokens,
});

const OTHER_CHAINS: SourceChain[] = [
  chain(1, "Ethereum", ETH, [
    { ...USDC, address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
    { ...USDT, address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
  ], "/logos/ethereum.svg"),
  chain(42161, "Arbitrum", ETH, [
    { ...USDC, address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" },
    { symbol: "ARB", name: "Arbitrum", decimals: 18, address: "0x912ce59144191c1204e64559fe8253a0e49e6548", logo_uri: "/logos/arbitrum.svg" },
  ], "/logos/arbitrum.svg"),
  chain(10, "Optimism", ETH, [{ ...USDT, address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58" }]),
  chain(137, "Polygon", { address: NATIVE, symbol: "POL", name: "Polygon", decimals: 18, logo_uri: "/logos/polygon.svg" }, [
    { ...USDC, address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" },
  ], "/logos/polygon.svg"),
  chain(8453, "Base", ETH, [
    { ...USDC, address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
    { symbol: "DEGEN", name: "Degen", decimals: 18, address: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed" },
  ], "/logos/base.svg"),
];

const PRICES: Record<string, number> = { USDC: 1, USDT: 1, AUSD: 1, ETH: 2_650, POL: 0.21, MON: 0.05, ARB: 0.42, DEGEN: 0.003 };

/** What the simulated wallet holds, by chain and symbol, in whole units. */
export const SIM_HOLDINGS: Record<string, number> = {
  "1:ETH": 0.42,
  "1:USDC": 45.1,
  "42161:USDC": 820.55,
  "42161:ETH": 0.018,
  "42161:ARB": 60,
  "10:USDT": 1_210,
  "10:ETH": 0.004,
  "137:POL": 34.2,
  "8453:DEGEN": 125_000,
  "8453:ETH": 0.03,
};

/** The deposit's own chain first, carrying its tokens; the others after. */
export function simSources(sim: Simulator): SourceChain[] {
  const network = sim.network;
  const own = OTHER_CHAINS.find((c) => c.id === network.chain.id);
  const tokens = network.tokens.map((t) => ({ address: t.address.toLowerCase(), symbol: t.symbol, name: t.symbol, decimals: t.decimals, logo_uri: t.icon }));
  const first: SourceChain = {
    ...(own ?? chain(network.chain.id, network.name, { ...ETH, symbol: network.nativeSymbol, name: network.nativeSymbol }, [], network.icon)),
    icon_url: network.icon,
    tokens: [...tokens, ...(own?.tokens.filter((t) => !tokens.some((x) => x.address === t.address)) ?? [])],
    native_alias: network.tokens.find((t) => t.native)?.address.toLowerCase(),
  };
  return [first, ...OTHER_CHAINS.filter((c) => c.id !== network.chain.id)];
}

const hex = (bytes: number) => `0x${Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toUnits(value: number, decimals: number): bigint {
  const [whole, frac = ""] = value.toFixed(Math.min(decimals, 12)).split(".");
  return BigInt(whole + frac.padEnd(decimals, "0").slice(0, decimals));
}

export function simRoutesClient(sim: Simulator): RoutesClient {
  const find = (chainId: number, address: string) => {
    const c = simSources(sim).find((x) => x.id === chainId);
    const token = c && (address === NATIVE ? c.native : c.tokens.find((t) => t.address === address.toLowerCase()));
    return c && token ? { chain: c, token } : null;
  };
  return {
    async sources() {
      await wait(250);
      return { available: true, chains: simSources(sim) };
    },
    async searchTokens(q, chainId) {
      await wait(200);
      const term = q.trim().toLowerCase();
      const out: FoundToken[] = [];
      for (const c of simSources(sim)) {
        if (chainId !== undefined && c.id !== chainId) continue;
        for (const t of [c.native, ...c.tokens]) {
          if (t.symbol.toLowerCase().includes(term) || t.name.toLowerCase().includes(term) || t.address === term) out.push({ ...t, chain_id: c.id });
        }
      }
      return out;
    },
    async prices(keys) {
      await wait(150);
      const out: Record<string, number | null> = {};
      for (const key of keys) {
        const [chainId, address] = key.split(":");
        const found = find(Number(chainId), address);
        out[key] = found ? (PRICES[found.token.symbol] ?? null) : null;
      }
      return out;
    },
    async quote({ origin_chain_id, origin_currency, amount }) {
      await wait(450 + Math.random() * 300);
      const found = find(origin_chain_id, origin_currency);
      const d = sim.getSnapshot().deposit;
      if (!found || !d) throw new RouteError("unsupported_chain", "Relay does not route from this chain", 400);
      if (found.token.symbol === "DEGEN") throw new RouteError("no_route", "no route from that token right now; try another", 422);
      const price = PRICES[found.token.symbol] ?? 1;
      const usdOut = Number(amount) / 10 ** d.token_decimals;
      const feeUsd = 0.02 + usdOut * 0.001;
      const originAmount = toUnits((usdOut + feeUsd) / price, found.token.decimals);
      const sameChain = origin_chain_id === d.chain_id;
      const requestId = hex(32);
      const quote: RouteQuote = {
        request_id: requestId,
        quoted_at: new Date().toISOString(),
        origin: { chain_id: origin_chain_id, currency: found.token, amount: originAmount.toString(), amount_usd: (usdOut + feeUsd).toFixed(2) },
        destination: {
          chain_id: d.chain_id,
          currency: { address: d.token_address, symbol: d.token, name: d.token, decimals: d.token_decimals },
          amount,
          amount_usd: usdOut.toFixed(2),
        },
        fees: {
          route_usd: feeUsd.toFixed(2),
          gas: { chain_id: origin_chain_id, currency: found.chain.native, amount: toUnits(0.004 / (PRICES[found.chain.native.symbol] ?? 1), 18).toString(), amount_usd: "0.00" },
        },
        time_estimate_secs: sameChain ? 1 : 2,
        steps: [
          ...(found.token.address === NATIVE
            ? []
            : [{ id: "approve", description: `Sign an approval for ${found.token.symbol}`, chain_id: origin_chain_id, to: found.token.address, data: "0x095ea7b3", value: "0" }]),
          {
            id: "deposit",
            description: `Depositing funds to the relayer to execute the swap for ${d.token}`,
            chain_id: origin_chain_id,
            to: "0x4cd00e387622c35bddb9b4c962c136462338bc31",
            data: "0xe8017952",
            value: found.token.address === NATIVE ? originAmount.toString() : "0",
          },
        ],
      };
      return quote;
    },
    async status(requestId) {
      await wait(120);
      return sim.routeStatus(requestId);
    },
    async sent() {},
  };
}

export function simBalanceOf(chainId: number, token: SourceToken): bigint {
  const units = SIM_HOLDINGS[`${chainId}:${token.symbol}`];
  return units ? toUnits(units, token.decimals) : 0n;
}

