"use client";

import * as React from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { formatUnits, shortHex } from "@/lib/format";
import { formatDuration, type PayModel } from "@/lib/pay/model";
import { explorerTx, type ResolvedAsset } from "@/lib/pay/networks";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { ExternalLink } from "./bits";
import type { SentPayment } from "./wallet-pane";

export interface Clock {
  /** Client ms, ticking. */
  now: number;
  /** server − client, ms. */
  offset: number;
}

type RowState = "done" | "active" | "waiting" | "failed";

interface Row {
  key: string;
  label: string;
  state: RowState;
  /** Server clock ms. */
  at: number | null;
  detail?: React.ReactNode;
}

const clockTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** The rows of the lifecycle, from the payer's send (when this page sent it) to settlement. */
export function timelineRows(args: {
  deposit: PayDeposit;
  model: PayModel;
  asset: ResolvedAsset;
  sent: SentPayment | null;
  offset: number;
}): { rows: Row[]; anchor: number | null } {
  const { deposit, model, asset, sent, offset } = args;
  const network = asset.network;
  const rows: Row[] = [];
  const sentAt = sent ? sent.at + offset : null;

  if (sent) {
    rows.push({
      key: "sent",
      label: "Sent from your wallet",
      state: sent.reverted ? "failed" : "done",
      at: sentAt,
      detail: (
        <ExternalLink href={explorerTx(network, sent.hash)} className="font-mono">
          {shortHex(sent.hash, 8, 6)}
        </ExternalLink>
      ),
    });
  }

  for (const step of model.steps) {
    let detail: React.ReactNode = step.detail;
    if (step.key === "detected" && model.transfers.length > 0) {
      detail = (
        <span className="flex flex-col gap-0.5">
          {model.transfers.map((t) => (
            <span key={t.key} className={cn(t.orphanedAt !== null && "line-through opacity-60")}>
              <span className="tabular text-(--pay-ink)">
                {formatUnits(t.amountBase.toString(), deposit.token_decimals)} {deposit.token}
              </span>{" "}
              from <span className="font-mono">{shortHex(t.from, 6, 4)}</span> ·{" "}
              <ExternalLink href={explorerTx(network, t.tx_hash)} className="font-mono">
                {shortHex(t.tx_hash, 6, 4)}
              </ExternalLink>
            </span>
          ))}
        </span>
      );
    }
    if (step.key === "detected" && step.state === "active") {
      detail = sent ? `Watching ${network?.name ?? "the chain"} for your transfer` : undefined;
    }
    if (step.key === "confirmed" && step.state === "active" && !step.detail) {
      detail = `Waiting for ${network?.name ?? "the chain"} to confirm`;
    }
    if (step.key === "settled" && step.txHash) {
      detail = (
        <ExternalLink href={explorerTx(network, step.txHash)} className="font-mono">
          {shortHex(step.txHash, 8, 6)}
        </ExternalLink>
      );
    }
    rows.push({ key: step.key, label: step.label, state: step.state, at: step.at, detail });
  }

  return { rows, anchor: sentAt ?? model.firstSeenAt };
}

export function Timeline({ rows, anchor, clock }: { rows: Row[]; anchor: number | null; clock: Clock }) {
  const serverNow = clock.now + clock.offset;
  return (
    <ol className="relative">
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const delta =
          row.at !== null && anchor !== null
            ? row.at - anchor
            : row.state === "active" && anchor !== null
              ? serverNow - anchor
              : null;
        const isAnchor = row.at !== null && anchor !== null && Math.abs(row.at - anchor) < 1 && i === 0;
        return (
          <li key={row.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-5 bottom-0 left-[9px] w-px",
                  row.state === "done" ? "bg-(--pay-ink)/70" : "bg-(--pay-line)",
                )}
              />
            ) : null}
            <StepDot state={row.state} />
            <div className="min-w-0 flex-1 pt-px">
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={cn(
                    "text-[14px] font-medium",
                    row.state === "waiting" && "text-(--pay-faint)",
                    row.state === "failed" && "text-(--pay-danger)",
                  )}
                >
                  {row.label}
                </p>
                {isAnchor && row.at !== null ? (
                  <span className="tabular font-mono text-[12px] text-(--pay-muted)" suppressHydrationWarning>
                    {clockTime.format(row.at - clock.offset)}
                  </span>
                ) : delta !== null && row.state !== "waiting" ? (
                  <span
                    className={cn(
                      "tabular font-mono text-[12px]",
                      row.state === "active" ? "text-(--pay-brand)" : "text-(--pay-muted)",
                    )}
                    suppressHydrationWarning
                  >
                    +{formatDuration(delta)}
                  </span>
                ) : null}
              </div>
              {row.detail ? <div className="mt-0.5 text-[12.5px] text-(--pay-muted)">{row.detail}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepDot({ state }: { state: RowState }) {
  if (state === "done") {
    return (
      <span className="pay-pop relative z-10 flex size-[19px] shrink-0 items-center justify-center rounded-full bg-(--pay-ink) text-(--pay-card)">
        <CheckIcon className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="relative z-10 flex size-[19px] shrink-0 items-center justify-center rounded-full bg-(--pay-danger) text-white">
        <XIcon className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative z-10 flex size-[19px] shrink-0 items-center justify-center">
        <span className="pay-ping relative size-2.5 rounded-full bg-(--pay-brand) text-(--pay-brand)" />
      </span>
    );
  }
  return (
    <span className="relative z-10 flex size-[19px] shrink-0 items-center justify-center">
      <span className="size-2 rounded-full border-[1.5px] border-(--pay-line) bg-(--pay-card)" />
    </span>
  );
}

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
    ok: "bg-(--pay-ok) text-white",
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

/** Between the payer's send and the moment it is settled. */
export function ProgressView({
  deposit,
  model,
  asset,
  sent,
  clock,
  onPayAgain,
}: {
  deposit: PayDeposit;
  model: PayModel;
  asset: ResolvedAsset;
  sent: SentPayment | null;
  clock: Clock;
  /** Offered when a payment this page sent never showed up. */
  onPayAgain?: () => void;
}) {
  const { rows, anchor } = timelineRows({ deposit, model, asset, sent, offset: clock.offset });
  const chain = asset.network?.name ?? "the chain";
  const waitingForDetection = sent !== null && model.firstSeenAt === null;
  const slow = sent !== null && model.firstSeenAt === null && clock.now - sent.at > 45_000;

  const [title, subtitle] = waitingForDetection
    ? ["Payment sent", `Gum is watching ${chain} for it.`]
    : model.phase === "settling"
      ? ["Payment confirmed", "Paying it through to the recipient."]
      : ["Payment detected", `Confirming on ${chain}.`];

  return (
    <div className="pay-rise">
      <div className="flex flex-col items-center text-center">
        <StatusGlyph tone="working" />
        <h2 className="mt-4 text-[19px] font-semibold tracking-tight" aria-live="polite">
          {title}
        </h2>
        <p className="mt-1 text-[13.5px] text-(--pay-muted)">
          <span className="tabular font-medium text-(--pay-ink)">
            {formatUnits((sent && waitingForDetection ? BigInt(sent.amount) : model.received > model.amount ? model.received : model.amount).toString(), deposit.token_decimals)}{" "}
            {deposit.token}
          </span>
          {" · "}
          {subtitle}
        </p>
      </div>
      <div className="mt-6 rounded-xl border border-(--pay-line) px-4 py-4">
        <Timeline rows={rows} anchor={anchor} clock={clock} />
      </div>
      {slow ? (
        <div className="mt-3 px-1 text-center text-[12.5px] text-(--pay-warn)">
          <p>This is taking longer than usual. Check the transaction in your wallet.</p>
          {onPayAgain ? (
            <button type="button" onClick={onPayAgain} className="mt-1 font-medium text-(--pay-ink) underline underline-offset-2">
              It failed. Let me pay again
            </button>
          ) : null}
        </div>
      ) : !waitingForDetection ? (
        <p className="mt-3 px-1 text-center text-[12.5px] text-(--pay-muted)">
          You can close this page. The payment completes without it.
        </p>
      ) : null}
    </div>
  );
}
