import type { FoundToken, RouteQuote, RouteStatus, Sources } from "./types";

/**
 * Where the widget asks about routes. Live, it is gum-server through the same-origin proxy
 * (`/api/pay/{id}/...`); in test mode, the simulator answers.
 */
export interface RoutesClient {
  sources(): Promise<Sources>;
  searchTokens(q: string, chainId?: number): Promise<FoundToken[]>;
  /** USD prices by `assetKey`; null where there is none. */
  prices(keys: string[]): Promise<Record<string, number | null>>;
  quote(body: { user: string; origin_chain_id: number; origin_currency: string; amount: string }): Promise<RouteQuote>;
  status(requestId: string): Promise<RouteStatus>;
  /** The route's origin transaction went out: Relay can index it now. Best effort. */
  sent(requestId: string, txHash: string, chainId: number): Promise<void>;
}

export class RouteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

async function call<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
      signal: AbortSignal.timeout(init?.timeoutMs ?? 15_000),
    });
  } catch {
    throw new RouteError("unreachable", "Couldn't reach Gum. Check your connection and try again.", 0);
  }
  if (res.status === 202 || res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    throw new RouteError(body?.error?.code ?? "http_error", body?.error?.message ?? "Something went wrong. Try again.", res.status);
  }
  return body as T;
}

export function httpRoutesClient(apiBase: string, depositId: string): RoutesClient {
  const base = `${apiBase}/${depositId}`;
  return {
    sources: () => call<Sources>(`${base}/sources`),
    async searchTokens(q, chainId) {
      const params = new URLSearchParams({ q });
      if (chainId !== undefined) params.set("chain_id", String(chainId));
      return (await call<{ tokens: FoundToken[] }>(`${base}/sources/tokens?${params}`)).tokens;
    },
    async prices(keys) {
      if (keys.length === 0) return {};
      const body = JSON.stringify({ tokens: keys });
      return (await call<{ prices: Record<string, number | null> }>(`${base}/prices`, { method: "POST", body })).prices;
    },
    quote: (body) => call<RouteQuote>(`${base}/quote`, { method: "POST", body: JSON.stringify(body), timeoutMs: 20_000 }),
    status: (requestId) => call<RouteStatus>(`${base}/routes/${requestId}`),
    async sent(requestId, txHash, chainId) {
      await call<void>(`${base}/routes/${requestId}/transactions`, {
        method: "POST",
        body: JSON.stringify({ tx_hash: txHash, chain_id: chainId }),
      }).catch(() => {});
    },
  };
}
