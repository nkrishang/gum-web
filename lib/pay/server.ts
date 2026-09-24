import "server-only";

import { cache } from "react";
import { gumApiUrl } from "@/lib/server-env";
import type { PayDeposit } from "./types";

/** Deposit ids are UUIDs. Anything else never reaches the API. */
export const DEPOSIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LoadResult = { kind: "found"; deposit: PayDeposit } | { kind: "not_found" } | { kind: "unavailable" };

/**
 * The payer view, for the page's first paint. Once per request (metadata and page share it). An
 * outage is not a 404: the page renders without it and the widget keeps trying from the browser.
 */
export const loadPayDeposit = cache(async (id: string): Promise<LoadResult> => {
  if (!DEPOSIT_ID.test(id)) return { kind: "not_found" };
  try {
    const res = await fetch(`${gumApiUrl}/v1/pay/${id}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) return { kind: "unavailable" };
    return { kind: "found", deposit: (await res.json()) as PayDeposit };
  } catch {
    return { kind: "unavailable" };
  }
});

/** `?return_url=` becomes a "Back to <host>" button. Only http(s), and the host is always shown. */
export function parseReturnTo(raw: string | string[] | undefined): { href: string; host: string } | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { href: url.toString(), host: url.host };
  } catch {
    return null;
  }
}
