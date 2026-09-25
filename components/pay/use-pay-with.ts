"use client";

import * as React from "react";
import type { ResolvedAsset } from "@/lib/pay/networks";
import type { RoutesClient } from "@/lib/pay/routes/client";
import { RouteError } from "@/lib/pay/routes/client";
import { NATIVE, assetKey, type RouteQuote, type SourceChain, type SourceToken, type Sources } from "@/lib/pay/routes/types";
import type { PayDeposit } from "@/lib/pay/types";
import type { WalletApi } from "./wallet/types";

/**
 * What the payer pays with. The deposit's own token on its own chain is always first and always
 * the default: it needs no route, so nothing is lost to fees or liquidity. Once a wallet is
 * connected, every chain Relay routes from is checked for a balance (a few at a time, each one
 * batch of reads), the balances are priced, and whatever is held is listed after it: first what
 * covers the payment, the same token on other chains ahead of the rest, then by value. Picking one
 * of those asks gum-server for a route and keeps it fresh until the payer pays.
 */

export interface PayOption {
  key: string;
  chain: SourceChain;
  token: SourceToken;
  native: boolean;
  /** The deposit's own token on its own chain: paid with a plain transfer, no route. */
  requested: boolean;
  /** Undefined while unknown. */
  balance?: bigint;
  price: number | null;
  /** The balance in USD, when priced. */
  usd: number | null;
  /** Whether the balance covers what's owed (roughly, for a route: the quote says exactly). */
  covers: boolean | null;
}

export interface QuoteState {
  status: "idle" | "loading" | "ready" | "error";
  quote?: RouteQuote;
  error?: RouteError;
  /** Client ms when it arrived. */
  at?: number;
}

export interface PayWith {
  /** Relay can route to this deposit: other tokens and chains are on offer. */
  available: boolean;
  sources: "idle" | "loading" | "ready" | "off" | "error";
  options: PayOption[];
  /** Chains checked so far, while a scan runs. */
  scan: { done: number; total: number } | null;
  selected: PayOption | null;
  select(option: PayOption): void;
  /** The selection needs a route (it is not the requested token on the requested chain). */
  isRoute: boolean;
  quote: QuoteState;
  refreshQuote(): Promise<RouteQuote | null>;
  /** Stops refreshing the quote while one is being paid. */
  hold(held: boolean): void;
  /**
   * True from the moment a payment starts until its flow ends, however the page rearranges itself
   * meanwhile: no second payment may start while the first is unresolved.
   */
  executing: boolean;
  /** Claims the one payment slot before the first await. False when a payment is already under way. */
  beginExecution(): boolean;
  /** Releases the slot when the flow ends, paid or not. */
  endExecution(): void;
  /** The wallet's native balance on a chain, for gas. */
  nativeBalance(chainId: number): bigint | undefined;
  /** Tokens beyond the scan: Relay's search, with the wallet's balance of each. */
  search(q: string): Promise<PayOption[]>;
  /** A held option that covers the payment, when the requested token doesn't. */
  suggestion: PayOption | null;
  chain(id: number): SourceChain | undefined;
}

/** A quote older than this is fetched again before it's paid, and refreshed while it's shown. */
export const QUOTE_TTL_MS = 30_000;
const SCAN_CONCURRENCY = 8;
const STABLES = new Set(["USDC", "USDT", "USDT0", "AUSD", "DAI", "USDE", "USDS", "PYUSD", "FDUSD", "USDC.E", "USD₮0"]);

function tokensOf(c: SourceChain): { token: SourceToken; native: boolean }[] {
  const out = c.native_alias ? [] : [{ token: c.native, native: true }];
  const seen = new Set(out.map((t) => t.token.address));
  for (const t of c.tokens) {
    if (seen.has(t.address)) continue;
    seen.add(t.address);
    out.push({ token: t, native: false });
  }
  return out;
}

function units(amount: bigint, decimals: number): number {
  const scale = 10 ** Math.min(decimals, 18);
  return Number(amount) / scale / 10 ** Math.max(0, decimals - 18);
}

export function usePayWith({
  routes,
  wallet,
  deposit,
  asset,
  remaining,
  active,
  quoting,
}: {
  routes: RoutesClient | null;
  wallet: WalletApi;
  deposit: PayDeposit | null;
  asset: ResolvedAsset | null;
  remaining: bigint;
  /** The deposit is taking payments. */
  active: boolean;
  /**
   * A routed selection is on screen and not yet paid: only then are quotes fetched and refreshed.
   * Each one spends Relay's per-minute budget, shared by every payer.
   */
  quoting: boolean;
}): PayWith {
  const address = wallet.status === "connected" ? wallet.address : undefined;
  const walletRef = React.useRef(wallet);
  React.useEffect(() => {
    walletRef.current = wallet;
  });

  // ---- sources: once per widget, when it takes payments ---------------------------------------
  const [sources, setSources] = React.useState<{ status: PayWith["sources"]; data?: Sources }>({ status: "idle" });
  const wantSources = Boolean(routes && active && asset?.verified);
  const asked = React.useRef<RoutesClient | null>(null);
  React.useEffect(() => {
    if (!wantSources || !routes || asked.current === routes) return;
    asked.current = routes;
    setSources({ status: "loading" });
    routes
      .sources()
      .then((data) => setSources({ status: data.available ? "ready" : "off", data }))
      .catch(() => {
        // Tried again the next time the widget asks (a remount), not in a loop.
        asked.current = null;
        setSources({ status: "error" });
      });
  }, [wantSources, routes]);
  const chains = React.useMemo(() => (sources.status === "ready" ? (sources.data?.chains ?? []) : []), [sources]);

  // ---- balances: every chain, a few at a time ---------------------------------------------------
  const [balances, setBalances] = React.useState<{ owner?: string; map: Map<string, bigint> }>({ map: new Map() });
  const [scan, setScan] = React.useState<{ done: number; total: number } | null>(null);
  const [prices, setPrices] = React.useState<Map<string, number | null>>(new Map());
  const pricesRef = React.useRef(prices);
  React.useEffect(() => {
    pricesRef.current = prices;
  });

  const priceMissing = React.useCallback(
    async (keys: string[]) => {
      if (!routes) return;
      const missing = [...new Set(keys)].filter((k) => !pricesRef.current.has(k));
      for (let i = 0; i < missing.length; i += 40) {
        const chunk = missing.slice(i, i + 40);
        const got = await routes.prices(chunk).catch(() => ({}) as Record<string, number | null>);
        setPrices((prev) => {
          const next = new Map(prev);
          for (const k of chunk) next.set(k, got[k] ?? null);
          return next;
        });
      }
    },
    [routes],
  );

  const requestedKey = deposit ? assetKey(deposit.chain_id, deposit.token_address) : null;
  React.useEffect(() => {
    if (!address || chains.length === 0) return;
    let cancelled = false;
    const owner = address.toLowerCase();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBalances({ owner, map: new Map() });
    setScan({ done: 0, total: chains.length });
    const queue = [...chains];
    const held: string[] = [];
    const worker = async () => {
      while (queue.length > 0 && !cancelled) {
        const c = queue.shift()!;
        const list = tokensOf(c);
        const got = await walletRef.current.readBalances(c, list.map((t) => t.token)).catch(() => list.map(() => null));
        if (cancelled) return;
        const read = list.flatMap(({ token }, i) => (got[i] === null || got[i] === undefined ? [] : [[assetKey(c.id, token.address), got[i]!] as const]));
        for (const [key, balance] of read) if (balance > 0n) held.push(key);
        setBalances((prev) => (prev.owner === owner ? { owner, map: new Map([...prev.map, ...read]) } : prev));
        // The native balance pays for gas, even where it isn't listed (Arc).
        if (c.native_alias) {
          const [gas] = await walletRef.current.readBalances(c, [c.native]).catch(() => [null]);
          if (!cancelled && gas !== null && gas !== undefined) {
            setBalances((prev) => (prev.owner === owner ? { owner, map: new Map(prev.map).set(assetKey(c.id, NATIVE), gas) } : prev));
          }
        }
        if (cancelled) return;
        setScan((s) => (s ? { ...s, done: s.done + 1 } : s));
      }
    };
    void Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker)).then(() => {
      if (cancelled) return;
      setScan(null);
      void priceMissing(requestedKey ? [requestedKey, ...held] : held);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chains, priceMissing, requestedKey]);

  // ---- the requested asset ----------------------------------------------------------------------
  const requested = React.useMemo<PayOption | null>(() => {
    if (!asset?.verified || !deposit) return null;
    const own = chains.find((c) => c.id === deposit.chain_id);
    const n = asset.network;
    const chain: SourceChain = {
      id: n.chain.id,
      name: n.name,
      icon_url: n.icon,
      explorer_url: n.explorer,
      rpc_url: n.chain.rpcUrls.default.http[0],
      native: { address: NATIVE, symbol: n.nativeSymbol, name: n.nativeSymbol, decimals: n.chain.nativeCurrency.decimals },
      tokens: [],
      ...own,
      // Our own marks for our own chains.
      ...(own ? { icon_url: n.icon, name: n.name } : {}),
    };
    const token: SourceToken = {
      address: asset.token.address.toLowerCase(),
      symbol: asset.token.symbol,
      name: asset.token.symbol,
      decimals: asset.token.decimals,
      logo_uri: asset.token.icon,
    };
    const key = assetKey(chain.id, token.address);
    return {
      key,
      chain,
      token,
      native: false,
      requested: true,
      balance: address ? wallet.tokenBalance : undefined,
      price: prices.get(key) ?? 1,
      usd: address && wallet.tokenBalance !== undefined ? units(wallet.tokenBalance, token.decimals) * (prices.get(key) ?? 1) : null,
      covers: address && wallet.tokenBalance !== undefined ? wallet.tokenBalance >= remaining : null,
    };
  }, [asset, deposit, chains, address, wallet.tokenBalance, remaining, prices]);

  // Stablecoin deposits: what's owed, in USD, is the amount at the token's price (or $1).
  const owedUsd = requested ? units(remaining, requested.token.decimals) * (prices.get(requested.key) ?? 1) : 0;

  const optionOf = React.useCallback(
    (chain: SourceChain, token: SourceToken, native: boolean, balance: bigint | undefined): PayOption => {
      const key = assetKey(chain.id, token.address);
      const price = prices.get(key) ?? null;
      const usd = balance !== undefined && price !== null ? units(balance, token.decimals) * price : null;
      // A little over what's owed, for the route's fees.
      const covers = usd === null ? null : usd >= owedUsd * 1.01 + 0.05;
      return { key, chain, token, native, requested: false, balance, price, usd, covers };
    },
    [prices, owedUsd],
  );

  const [extra, setExtra] = React.useState<PayOption | null>(null);
  const options = React.useMemo<PayOption[]>(() => {
    if (!requested) return [];
    const held: PayOption[] = [];
    const scanned = balances.owner === address?.toLowerCase() ? balances.map : new Map<string, bigint>();
    for (const c of chains) {
      for (const { token, native } of tokensOf(c)) {
        const key = assetKey(c.id, token.address);
        const balance = scanned.get(key);
        if (key === requested.key || !balance || balance === 0n) continue;
        held.push(optionOf(c, token, native, balance));
      }
    }
    if (extra && extra.key !== requested.key && !held.some((o) => o.key === extra.key)) {
      held.push(optionOf(extra.chain, extra.token, extra.native, scanned.get(extra.key) ?? extra.balance));
    }
    const rank = (o: PayOption) => (o.covers === true ? 0 : o.covers === null ? 1 : 2);
    const kind = (o: PayOption) =>
      o.token.symbol.toUpperCase() === requested.token.symbol.toUpperCase() ? 0 : STABLES.has(o.token.symbol.toUpperCase()) ? 1 : 2;
    held.sort((a, b) => rank(a) - rank(b) || kind(a) - kind(b) || (b.usd ?? -1) - (a.usd ?? -1) || a.chain.name.localeCompare(b.chain.name));
    return [requested, ...held];
  }, [requested, chains, balances, address, extra, optionOf]);

  // ---- selection --------------------------------------------------------------------------------
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  // Until the payer picks, the requested token, unless the wallet can't cover it and the scan found
  // something that can: then that, with the requested token still first in the list.
  const suggestion =
    requested && requested.covers === false ? (options.find((o) => !o.requested && o.covers === true) ?? null) : null;
  const fallback = suggestion && scan === null ? suggestion : requested;
  const selected = options.find((o) => o.key === selectedKey) ?? fallback;
  const isRoute = Boolean(selected && !selected.requested && sources.status === "ready");
  const select = React.useCallback(
    (option: PayOption) => {
      if (!option.requested && !options.some((o) => o.key === option.key)) setExtra(option);
      setSelectedKey(option.key);
    },
    [options],
  );


  // ---- the quote, for a routed selection ------------------------------------------------------
  const [quote, setQuote] = React.useState<QuoteState & { forKey?: string }>({ status: "idle" });
  const [held, setHeld] = React.useState(false);
  const [nonce, setNonce] = React.useState(0);

  // ---- the one payment --------------------------------------------------------------------------
  // Claimed synchronously, before the first await of a payment's flow: stage set in state comes too
  // late, and a second click (or a Change, or a disconnect-and-reconnect) in that window would
  // start a second payment while the first is still being signed.
  const executingRef = React.useRef(false);
  const [executing, setExecuting] = React.useState(false);
  const beginExecution = React.useCallback(() => {
    if (executingRef.current) return false;
    executingRef.current = true;
    setExecuting(true);
    setHeld(true);
    return true;
  }, []);
  const endExecution = React.useCallback(() => {
    executingRef.current = false;
    setExecuting(false);
    setHeld(false);
  }, []);

  const quoteKey = isRoute && selected && address && remaining > 0n ? `${selected.key}|${remaining}|${address.toLowerCase()}` : null;

  const fetchQuote = React.useCallback(async (): Promise<RouteQuote | null> => {
    if (!routes || !quoteKey || !selected || !address) return null;
    const forKey = quoteKey;
    setQuote((q) => ({ status: "loading", quote: q.forKey === forKey ? q.quote : undefined, forKey }));
    try {
      const fresh = await routes.quote({
        user: address,
        origin_chain_id: selected.chain.id,
        origin_currency: selected.native ? NATIVE : selected.token.address,
        amount: remaining.toString(),
      });
      setQuote((q) => (q.forKey === forKey ? { status: "ready", quote: fresh, at: Date.now(), forKey } : q));
      return fresh;
    } catch (cause) {
      const error = cause instanceof RouteError ? cause : new RouteError("unknown", "Couldn't get a route. Try again.", 0);
      setQuote((q) => (q.forKey === forKey ? { status: "error", error, forKey } : q));
      return null;
    }
  }, [routes, quoteKey, selected, address, remaining]);
  const fetchRef = React.useRef(fetchQuote);
  React.useEffect(() => {
    fetchRef.current = fetchQuote;
  });

  // Debounced on every change of what's quoted, then refreshed while it's on screen.
  const refreshing = Boolean(quoteKey) && quoting && !held;
  React.useEffect(() => {
    if (!refreshing) return;
    const t = setTimeout(() => void fetchRef.current(), 200);
    return () => clearTimeout(t);
  }, [refreshing, quoteKey, nonce]);
  React.useEffect(() => {
    if (quote.status !== "ready" || !refreshing) return;
    const t = setTimeout(() => setNonce((n) => n + 1), QUOTE_TTL_MS);
    return () => clearTimeout(t);
  }, [quote.status, quote.at, refreshing]);

  const current: QuoteState = quote.forKey === quoteKey ? quote : { status: quoteKey ? "loading" : "idle" };

  // ---- search -----------------------------------------------------------------------------------
  const search = React.useCallback(
    async (q: string): Promise<PayOption[]> => {
      if (!routes || !requested) return [];
      const found = (await routes.searchTokens(q)).slice(0, 16);
      const byChain = new Map<number, typeof found>();
      for (const t of found) {
        if (!chains.some((c) => c.id === t.chain_id)) continue;
        byChain.set(t.chain_id, [...(byChain.get(t.chain_id) ?? []), t]);
      }
      const out: PayOption[] = [];
      await Promise.all(
        [...byChain].map(async ([chainId, tokens]) => {
          const c = chains.find((x) => x.id === chainId)!;
          const got = address ? await walletRef.current.readBalances(c, tokens).catch(() => tokens.map(() => null)) : tokens.map(() => null);
          tokens.forEach((t, i) => {
            const token: SourceToken = { address: t.address, symbol: t.symbol, name: t.name, decimals: t.decimals, logo_uri: t.logo_uri };
            const key = assetKey(chainId, t.address);
            out.push(key === requested.key ? requested : optionOf(c, token, t.address === NATIVE, got[i] ?? undefined));
          });
        }),
      );
      void priceMissing(out.filter((o) => (o.balance ?? 0n) > 0n).map((o) => o.key));
      return out.sort((a, b) => Number(b.requested) - Number(a.requested) || Number((b.balance ?? 0n) > 0n) - Number((a.balance ?? 0n) > 0n));
    },
    [routes, requested, chains, address, optionOf, priceMissing],
  );

  return {
    available: sources.status === "ready",
    sources: sources.status,
    options,
    scan,
    selected,
    select,
    isRoute,
    quote: current,
    refreshQuote: fetchQuote,
    hold: setHeld,
    executing,
    beginExecution,
    endExecution,
    nativeBalance: (chainId) =>
      (balances.owner === address?.toLowerCase() ? balances.map.get(assetKey(chainId, NATIVE)) : undefined) ??
      (requested && chainId === requested.chain.id ? wallet.nativeBalance : undefined),
    search,
    suggestion,
    chain: (id) => chains.find((c) => c.id === id),
  };
}
