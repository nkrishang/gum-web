import { parseTime } from "./time";
import type { PayDeposit, PayEvent, PayTransfer } from "./types";

/**
 * What the page should be doing, derived from the deposit alone. Pure, so the live page, the
 * test mode and anything embedding the widget agree on it.
 *
 *   awaiting    nothing seen yet; show how to pay
 *   partial     something arrived, but less than the amount; show how to pay the rest
 *   confirming  enough is on its way (seen at chain head); waiting for confirmations
 *   settling    the confirmed total reached the amount; Gum is paying the receiver
 *   settled     done
 *   failed      paid, but settlement failed; the payer has nothing to do
 *   expired     the request closed before it was paid
 */
export type PayPhase = "awaiting" | "partial" | "confirming" | "settling" | "settled" | "failed" | "expired";

export interface TransferView extends PayTransfer {
  key: string;
  amountBase: bigint;
  /** Server clock, ms. */
  seenAt: number;
  confirmedAt: number | null;
  orphanedAt: number | null;
}

export type StepState = "done" | "active" | "waiting" | "failed";

export interface Step {
  key: "detected" | "confirmed" | "settling" | "settled";
  label: string;
  state: StepState;
  /** Server clock, ms, when it happened. */
  at: number | null;
  detail?: string;
  txHash?: string;
}

export interface PayModel {
  phase: PayPhase;
  amount: bigint;
  confirmed: bigint;
  /** Seen at chain head, not confirmed yet, not orphaned. */
  inFlight: bigint;
  /** What the payer still has to send: amount − confirmed − in flight, never below zero. */
  remaining: bigint;
  /** Anything arrived at all. */
  received: bigint;
  transfers: TransferView[];
  /** The newest orphaned transfer, while nothing newer has replaced it. */
  orphaned: TransferView | null;
  steps: Step[];
  expiresAt: number;
  /** Only while this is true may the page show the address, the QR or a pay button. */
  acceptsPayment: boolean;
  terminal: boolean;
  /** First sign of the payment, server clock ms. The latency readouts count from here. */
  firstSeenAt: number | null;
  settledAt: number | null;
}

const ms = parseTime;

const big = (v: string | undefined | null): bigint => {
  try {
    return BigInt(v ?? "0");
  } catch {
    return 0n;
  }
};

function transfersOf(events: PayEvent[]): TransferView[] {
  const byKey = new Map<string, TransferView>();
  for (const event of events) {
    const t = event.data?.transfer;
    if (!t || !t.tx_hash) continue;
    const key = `${t.tx_hash.toLowerCase()}:${t.log_index}`;
    const at = ms(event.created_at) ?? 0;
    const prev = byKey.get(key);
    const next: TransferView = {
      ...(prev ?? { seenAt: at, confirmedAt: null, orphanedAt: null }),
      ...t,
      key,
      amountBase: big(t.amount),
    };
    if (event.type === "deposit.payment_orphaned" || t.status === "orphaned") next.orphanedAt = at;
    else if (event.type === "deposit.payment_confirmed" || t.status === "confirmed") next.confirmedAt ??= at;
    byKey.set(key, next);
  }
  return [...byKey.values()].sort((a, b) => a.seenAt - b.seenAt);
}

function firstAt(events: PayEvent[], type: string): number | null {
  const e = events.find((x) => x.type === type);
  return e ? ms(e.created_at) : null;
}

function lastOf(events: PayEvent[], type: string): PayEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].type === type) return events[i];
  return undefined;
}

/** `now` is on the server's clock (see `serverNow`). */
export function payModel(deposit: PayDeposit, now: number): PayModel {
  const events = deposit.events ?? [];
  const amount = big(deposit.amount);
  const confirmed = big(deposit.confirmed_amount);
  const transfers = transfersOf(events);
  const live = transfers.filter((t) => t.orphanedAt === null);
  const inFlight = live.filter((t) => t.confirmedAt === null).reduce((sum, t) => sum + t.amountBase, 0n);
  const received = confirmed + inFlight;
  const outstanding = amount - confirmed - inFlight;
  const remaining = outstanding > 0n ? outstanding : 0n;
  const expiresAt = ms(deposit.expires_at) ?? 0;

  const lastOrphan = [...transfers].reverse().find((t) => t.orphanedAt !== null) ?? null;
  const newerLive = lastOrphan ? live.some((t) => t.seenAt > (lastOrphan.orphanedAt ?? 0)) : false;
  const orphaned = lastOrphan && !newerLive && inFlight === 0n ? lastOrphan : null;

  const open = deposit.status === "pending" || deposit.status === "partial_paid";
  // The server expires a request when the indexer says so; the page stops offering the address
  // the moment the clock runs out, so nobody sends into a closed request in the gap.
  const locallyExpired = open && now >= expiresAt;

  let phase: PayPhase;
  switch (deposit.status) {
    case "settled":
      phase = "settled";
      break;
    case "failed":
      phase = "failed";
      break;
    case "expired":
      phase = "expired";
      break;
    case "paid":
      phase = "settling";
      break;
    default:
      if (locallyExpired && remaining > 0n) phase = "expired";
      else if (received === 0n) phase = "awaiting";
      else if (remaining === 0n) phase = "confirming";
      else phase = "partial";
  }

  const acceptsPayment = (phase === "awaiting" || phase === "partial") && remaining > 0n;
  const terminal = phase === "settled" || phase === "failed" || phase === "expired";

  // The timeline. Detection is the first sign of the payment at all: a pending transfer, or a
  // confirmed one when the chain confirmed it before head detection had a chance to report.
  const detectedAt = firstAt(events, "deposit.detected") ?? firstAt(events, "deposit.payment_confirmed");
  const readyAt = firstAt(events, "deposit.ready");
  const submittedAt = firstAt(events, "deposit.settlement_submitted");
  const includedEvent = lastOf(events, "deposit.settlement_included");
  const settledAt = ms(deposit.timestamps.settled_at) ?? firstAt(events, "deposit.settled");
  const failedAt = ms(deposit.timestamps.failed_at) ?? firstAt(events, "deposit.failed");
  const lastConfirm = lastOf(events, "deposit.payment_confirmed");
  const confirmBlock = lastConfirm?.data?.transfer?.block_number;

  const steps: Step[] = [
    {
      key: "detected",
      label: "Payment detected",
      state: detectedAt !== null ? "done" : phase === "expired" ? "waiting" : "active",
      at: detectedAt,
    },
    {
      key: "confirmed",
      label: "Confirmed on-chain",
      state: readyAt !== null ? "done" : detectedAt !== null && !terminal ? "active" : "waiting",
      at: readyAt,
      detail: confirmBlock ? `Block ${confirmBlock.toLocaleString("en-US")}` : undefined,
    },
    {
      key: "settling",
      label: "Settling",
      state:
        includedEvent || settledAt !== null
          ? "done"
          : phase === "failed"
            ? "failed"
            : phase === "settling"
              ? "active"
              : "waiting",
      at: ms(includedEvent?.created_at) ?? submittedAt,
      detail: includedEvent ? "Transaction included" : submittedAt !== null ? "Transaction submitted" : undefined,
    },
    {
      key: "settled",
      label: phase === "failed" ? "Settlement failed" : "Settled",
      state: settledAt !== null ? "done" : phase === "failed" ? "failed" : "waiting",
      at: settledAt ?? failedAt,
      txHash: deposit.tx_hash,
    },
  ];

  return {
    phase,
    amount,
    confirmed,
    inFlight,
    remaining,
    received,
    transfers,
    orphaned,
    steps,
    expiresAt,
    acceptsPayment,
    terminal,
    firstSeenAt: detectedAt,
    settledAt,
  };
}

/** "1.2s", "340ms", "2m 04s". */
export function formatDuration(msValue: number): string {
  const v = Math.max(0, msValue);
  if (v < 1_000) return `${Math.round(v)}ms`;
  if (v < 60_000) return `${(v / 1_000).toFixed(v < 10_000 ? 2 : 1)}s`;
  const m = Math.floor(v / 60_000);
  const s = Math.floor((v % 60_000) / 1_000);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** "14:32", "1:02:09", "3d 4h". */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1_000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
