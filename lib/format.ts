import type { DepositStatus } from "@/lib/gum/types";

export const CHAINS: Record<number, { name: string; slug: string; explorer: string }> = {
  8453: { name: "Base", slug: "base", explorer: "https://basescan.org" },
  42161: { name: "Arbitrum", slug: "arbitrum", explorer: "https://arbiscan.io" },
  5042: { name: "Arc", slug: "arc", explorer: "https://explorer.arc.io" },
  143: { name: "Monad", slug: "monad", explorer: "https://monadexplorer.com" },
};

export function chainName(chainId: number): string {
  return CHAINS[chainId]?.name ?? `Chain ${chainId}`;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = CHAINS[chainId];
  return chain ? `${chain.explorer}/address/${address}` : null;
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const chain = CHAINS[chainId];
  return chain ? `${chain.explorer}/tx/${hash}` : null;
}

/** "2500000" with 6 decimals → "2.50". Exact, BigInt-based; no floats. */
export function formatUnits(base: string, decimals: number, opts?: { minFraction?: number; maxFraction?: number }): string {
  const minFraction = opts?.minFraction ?? 2;
  const maxFraction = opts?.maxFraction ?? Math.min(decimals, 6);
  let value: bigint;
  try {
    value = BigInt(base);
  } catch {
    return base;
  }
  const negative = value < 0n;
  if (negative) value = -value;
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  let fraction = (value % divisor).toString().padStart(decimals, "0");
  fraction = fraction.slice(0, maxFraction).replace(/0+$/, "");
  if (fraction.length < minFraction) fraction = fraction.padEnd(minFraction, "0");
  const wholeText = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}${wholeText}${fraction ? `.${fraction}` : ""}`;
}

export function shortHex(value: string, lead = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateTimeFull = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear ? dateTime.format(d) : dateTimeFull.format(d);
}

export function formatDateFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFull.format(d);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = then - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  return rtf.format(Math.round(diff / day), "day");
}

export const STATUS_LABEL: Record<DepositStatus, string> = {
  pending: "Pending",
  partial_paid: "Partially paid",
  paid: "Paid",
  settled: "Settled",
  failed: "Failed",
  expired: "Expired",
};

export const STATUS_HINT: Record<DepositStatus, string> = {
  pending: "Address issued and watched. Waiting for the payer.",
  partial_paid: "A transfer was seen, but the confirmed total is below the amount.",
  paid: "Confirmed total reached the amount. Settlement submitted.",
  settled: "The receiver was paid. Terminal.",
  failed: "Settlement failed. See the failure code. Terminal.",
  expired: "Expired before the amount was paid. Terminal.",
};

/** Human label for a deposit timeline event type. */
export function eventLabel(type: string): string {
  const map: Record<string, string> = {
    "deposit.created": "Created",
    "deposit.watch_registered": "Watch registered",
    "deposit.watch_lost": "Watch re-registered",
    "deposit.reconciled": "Reconciled",
    "deposit.detected": "Payment detected",
    "deposit.payment_confirmed": "Payment confirmed",
    "deposit.payment_orphaned": "Payment orphaned",
    "deposit.ready": "Ready to settle",
    "deposit.settlement_submitted": "Settlement submitted",
    "deposit.settlement_included": "Settlement included",
    "deposit.settlement_retried": "Settlement retried",
    "deposit.settled": "Settled",
    "deposit.failed": "Failed",
    "deposit.expired": "Expired",
  };
  return map[type] ?? type.replace(/^deposit\./, "").replace(/_/g, " ");
}

export const APP_FACING_EVENTS = new Set([
  "deposit.detected",
  "deposit.payment_confirmed",
  "deposit.payment_orphaned",
  "deposit.ready",
  "deposit.settled",
  "deposit.failed",
  "deposit.expired",
]);
