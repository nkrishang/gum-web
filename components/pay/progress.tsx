"use client";

import * as React from "react";
import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";
import { formatUnits } from "@/lib/format";
import { parseTime } from "@/lib/pay/time";
import { formatDuration, formatLatency, type PayModel } from "@/lib/pay/model";
import { explorerTx, type ResolvedAsset } from "@/lib/pay/networks";
import { relayTxUrl, type RouteStatus } from "@/lib/pay/routes/types";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { ExternalLink, INLINE_LINK } from "./bits";
import { formatBalance } from "./pay-with";
import type { SentPayment } from "./wallet-pane";

export interface Clock {
  /** Client ms, ticking. */
  now: number;
  /** server − client, ms. */
  offset: number;
  /** How far `offset` can be off, ms. */
  error: number;
}

export interface ReturnTo {
  href: string;
  host: string;
}

const clockTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** The big mark at the top of a status view. */
export function StatusGlyph({ tone }: { tone: "working" | "ok" | "warn" | "muted" }) {
  if (tone === "working") {
    return (
      <span className="relative flex size-14 items-center justify-center">
        <svg viewBox="0 0 56 56" className="absolute inset-0" aria-hidden>
          <circle cx="28" cy="28" r="25" fill="none" stroke="var(--pay-line)" strokeWidth="3" />
          <path d="M28 3a25 25 0 0 1 25 25" fill="none" stroke="var(--pay-brand)" strokeWidth="3" strokeLinecap="round" className="pay-orbit" />
        </svg>
        <span className="size-3 rounded-full bg-(--pay-brand)" />
      </span>
    );
  }
  const colors = {
    ok: "bg-(--pay-ok-soft) text-(--pay-ok)",
    warn: "bg-(--pay-warn-soft) text-(--pay-warn)",
    muted: "bg-(--pay-sunk) text-(--pay-muted)",
  } as const;
  return (
    <span className={cn("pay-pop flex size-14 items-center justify-center rounded-full", colors[tone])}>
      {tone === "ok" ? (
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="pay-draw" />
        </svg>
      ) : tone === "warn" ? (
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
          <path d="M12 7v6M12 16.5v.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export function ReturnButton({ returnTo }: { returnTo: ReturnTo | null }) {
  if (!returnTo) return null;
  return (
    <a
      href={returnTo.href}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-(--pay-button) text-[15px] font-semibold text-(--pay-button-ink) transition-opacity hover:opacity-90"
    >
      <ArrowLeftIcon className="size-4" />
      Back to {returnTo.host}
    </a>
  );
}

/**
 * Everything after the payer pays, in one frame whose size never changes: a status, then two
 * checkpoints side by side (Detect, Settle), each with its time and a link to its transaction. Both
 * checkpoints are there from the first moment; they fill in as Gum reports.
 *
 * Times count from the payer's send when this page sent it, otherwise from detection, which is
 * then shown as a clock time. A payment routed through Relay (another token or chain) gets a third
 * checkpoint in front, Route, from the payer's transaction to Relay's fill.
 */
export function LifecycleView({
  deposit,
  model,
  asset,
  sent,
  routeStatus = null,
  clock,
  returnTo,
  onPayAgain,
}: {
  deposit: PayDeposit;
  model: PayModel;
  asset: ResolvedAsset;
  sent: SentPayment | null;
  /** Relay's word on a routed payment, while it's followed. */
  routeStatus?: RouteStatus | null;
  clock: Clock;
  returnTo: ReturnTo | null;
  /** Offered when a payment this page sent never showed up. */
  onPayAgain?: () => void;
}) {
  const serverNow = clock.now + clock.offset;
  // Frozen at the send; the fallback covers a payment remembered from before this was recorded.
  const sentAt = sent ? (sent.serverAt ?? sent.at + clock.offset) : null;
  const detectedAt = model.firstSeenAt;
  const anchor = sentAt ?? detectedAt;
  const settled = model.phase === "settled";
  const failed = model.phase === "failed";
  const settleAt = model.settledAt;
  const route = sent?.route ?? null;
  // A route has Relay's clock too: slow is well past its estimate, and never while Relay is working.
  const slowAfter = route ? Math.max(120_000, (route.timeEstimateSecs ?? 0) * 3_000) : 45_000;
  const slow = sent !== null && detectedAt === null && clock.now - sent.at > slowAfter;

  // The payer's transaction(s): what Gum saw arrive, or what this page sent before it did. A route's
  // own transaction is on another chain; it's linked from the Route checkpoint instead.
  const payments = model.transfers.filter((t) => t.orphanedAt === null).map((t) => t.tx_hash);
  if (payments.length === 0 && sent && !route) payments.push(sent.hash);

  const [tone, title, subtitle]: [React.ComponentProps<typeof StatusGlyph>["tone"], string, React.ReactNode] = settled
    ? ["ok", "Payment complete", null]
    : failed
      ? [
          "warn",
          "Payment received",
          <>
            Passing it on hit a problem that Gum is resolving.{" "}
            <strong className="font-medium text-(--pay-ink)">Don&apos;t pay again.</strong>
          </>,
        ]
      : detectedAt === null && route
        ? [
            "working",
            "Routing your payment",
            <>
              {formatBalance(route.amount, route.decimals)} {route.symbol} from {route.chainName}, arriving as{" "}
              {formatUnits(sent!.amount, deposit.token_decimals)} {deposit.token}.
            </>,
          ]
        : detectedAt === null
          ? ["working", "Payment sent", null]
          : ["working", "Payment detected", null];

  // Counted from the send, a time crosses the two clocks and is shown no finer than they agree;
  // counted from detection, both ends are Gum's and it is exact.
  const since = (at: number) =>
    sentAt !== null ? formatLatency(at - sentAt, clock.error) : `+${formatDuration(Math.max(0, at - (anchor ?? at)))}`;
  const detect: Checkpoint = {
    label: "Detect",
    state: detectedAt !== null ? "done" : "active",
    time:
      detectedAt !== null
        ? sentAt !== null
          ? since(detectedAt)
          : clockTime.format(detectedAt - clock.offset)
        : sentAt !== null
          ? since(serverNow)
          : null,
    links: payments.map((hash, i) => ({
      label: payments.length > 1 ? `Payment ${i + 1}` : "Payment",
      href: explorerTx(asset.network, hash),
    })),
  };
  const settle: Checkpoint = {
    label: "Settle",
    state: settled ? "done" : failed ? "failed" : detectedAt !== null ? "active" : "waiting",
    time:
      settleAt !== null && anchor !== null
        ? since(settleAt)
        : detectedAt !== null && anchor !== null && !failed
          ? since(serverNow)
          : null,
    // The settlement transaction exists as soon as Gum submits it, but the checkpoint is done only
    // when it landed (or failed outright); until then the link would promise a step that hasn't
    // happened.
    links:
      deposit.tx_hash && (settled || failed)
        ? [{ label: "Settlement", href: explorerTx(asset.network, deposit.tx_hash) }]
        : [],
  };

  // Relay's own clock, on the same footing as the deposit's event times: on a success that's when
  // it filled the route, which can be well before Gum detects the deposit. Done without a
  // timestamp shows no duration rather than an invented one.
  const routeReportedAt = routeStatus?.status === "success" ? parseTime(routeStatus.updated_at) : null;
  const routeDone = routeStatus?.status === "success" || detectedAt !== null;
  const routeCompletedAt = routeReportedAt ?? detectedAt;
  const routeCheckpoint: Checkpoint | null = route
    ? {
        label: "Route",
        state: routeDone ? "done" : "active",
        time: routeDone ? (routeCompletedAt !== null ? since(routeCompletedAt) : null) : sentAt !== null ? since(serverNow) : null,
        links: [
          { label: "Sent", href: route.explorer ? `${route.explorer}/tx/${sent!.hash}` : null },
          { label: "Relay", href: relayTxUrl(route.requestId) },
        ],
      }
    : null;
  // Until Relay fills, detection waits on the route rather than ticking.
  const detectShown: Checkpoint = route && !routeDone ? { ...detect, state: "waiting", time: null } : detect;

  return (
    <div className="pay-rise flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <StatusGlyph tone={tone} />
        <h2 className="mt-4 text-[19px] font-semibold tracking-tight" aria-live="polite">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 max-w-[320px] text-[13.5px] leading-relaxed text-(--pay-muted)">{subtitle}</p> : null}

        <div className={cn("mt-8 grid w-full", routeCheckpoint ? "grid-cols-3" : "grid-cols-2")}>
          {routeCheckpoint ? <CheckpointView checkpoint={routeCheckpoint} side="start" /> : null}
          <CheckpointView checkpoint={detectShown} side={routeCheckpoint ? "middle" : "start"} />
          <CheckpointView checkpoint={settle} side="end" />
        </div>
      </div>

      <div className="flex min-h-12 flex-col justify-end">
        {slow && route && routeStatus?.status === "failure" ? (
          <p className="text-center text-[12.5px] text-(--pay-warn)">
            Relay reports a problem filling the route. Waiting to be sure it can&apos;t still land —{" "}
            <strong className="font-medium text-(--pay-warn)">don&apos;t pay again.</strong>
          </p>
        ) : slow && route ? (
          <p className="text-center text-[12.5px] text-(--pay-warn)">
            Taking longer than usual. Relay is still on it — <strong className="font-medium text-(--pay-warn)">don&apos;t pay again.</strong>
          </p>
        ) : slow && onPayAgain ? (
          <p className="text-center text-[12.5px] text-(--pay-warn)">
            Taking longer than usual. Check your wallet.{" "}
            <button type="button" onClick={onPayAgain} className={INLINE_LINK}>
              It failed, let me pay again
            </button>
          </p>
        ) : returnTo && (settled || failed) ? (
          <ReturnButton returnTo={returnTo} />
        ) : !settled && !failed && detectedAt !== null ? (
          <p className="text-center text-[12.5px] text-(--pay-muted)">You can close this page. The payment completes without it.</p>
        ) : null}
      </div>
    </div>
  );
}

interface Checkpoint {
  label: string;
  state: "done" | "active" | "waiting" | "failed";
  time: string | null;
  links: { label: string; href: string | null }[];
}

/**
 * One end of the tracker. Each half draws its half of the rail between the dots, so the pair reads
 * as one line: ink once a step has started, pale before.
 */
function CheckpointView({ checkpoint, side }: { checkpoint: Checkpoint; side: "start" | "middle" | "end" }) {
  const { label, state, time, links } = checkpoint;
  // The rail into a checkpoint is ink once it has started; the rail out of it once it's done.
  const rail = (half: "in" | "out") => (
    <span
      aria-hidden
      className={cn(
        "absolute top-1/2 h-0.5 -translate-y-1/2",
        half === "out" ? "right-0 left-1/2" : "right-1/2 left-0",
        (half === "out" ? state === "done" : state !== "waiting") ? "bg-(--pay-ink)/70" : "bg-(--pay-line)",
      )}
    />
  );
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-6 w-full items-center justify-center">
        {side !== "start" ? rail("in") : null}
        {side !== "end" ? rail("out") : null}
        <Dot state={state} />
      </div>
      <p
        className={cn(
          "mt-2 text-[14px] font-medium",
          state === "waiting" && "text-(--pay-faint)",
          state === "failed" && "text-(--pay-danger)",
        )}
      >
        {label}
      </p>
      <p
        className={cn("tabular h-5 font-mono text-[12.5px]", state === "active" ? "text-(--pay-brand)" : "text-(--pay-muted)")}
        suppressHydrationWarning
      >
        {time ?? (state === "failed" ? "failed" : "")}
      </p>
      <p className="mt-1 flex h-5 flex-wrap justify-center gap-x-2 text-[12.5px]">
        {links.map((link) => (
          <ExternalLink key={link.label} href={link.href}>
            {link.label}
          </ExternalLink>
        ))}
      </p>
    </div>
  );
}

function Dot({ state }: { state: Checkpoint["state"] }) {
  if (state === "done") {
    return (
      <span className="pay-pop relative z-10 flex size-6 items-center justify-center rounded-full bg-(--pay-ink) text-(--pay-card)">
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="relative z-10 flex size-6 items-center justify-center rounded-full bg-(--pay-danger) text-white">
        <XIcon className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative z-10 flex size-6 items-center justify-center rounded-full bg-(--pay-card)">
        <span className="pay-ping relative size-3 rounded-full bg-(--pay-brand) text-(--pay-brand)" />
      </span>
    );
  }
  return (
    <span className="relative z-10 flex size-6 items-center justify-center rounded-full bg-(--pay-card)">
      <span className="size-3 rounded-full border-2 border-(--pay-line) bg-(--pay-card)" />
    </span>
  );
}
