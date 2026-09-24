"use client";

import * as React from "react";
import { ArrowLeftIcon, ZapIcon } from "lucide-react";
import { formatDateFull, formatUnits, shortHex } from "@/lib/format";
import { formatDuration, type PayModel } from "@/lib/pay/model";
import { explorerAddress, explorerTx, type ResolvedAsset } from "@/lib/pay/networks";
import type { PayDeposit } from "@/lib/pay/types";
import { ChainIcon, ExternalLink } from "./bits";
import { StatusGlyph, Timeline, timelineRows, type Clock } from "./progress";
import type { SentPayment } from "./wallet-pane";

export interface ReturnTo {
  href: string;
  host: string;
}

function Heading({ tone, title, children }: { tone: React.ComponentProps<typeof StatusGlyph>["tone"]; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <StatusGlyph tone={tone} />
      <h2 className="mt-4 text-[19px] font-semibold tracking-tight" aria-live="polite">
        {title}
      </h2>
      {children ? <div className="mt-1 max-w-[340px] text-[13.5px] leading-relaxed text-(--pay-muted)">{children}</div> : null}
    </div>
  );
}

function ReturnButton({ returnTo }: { returnTo: ReturnTo | null }) {
  if (!returnTo) return null;
  return (
    <a
      href={returnTo.href}
      className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-(--pay-button) text-[15px] font-semibold text-(--pay-button-ink) transition-opacity hover:opacity-90"
    >
      <ArrowLeftIcon className="size-4" />
      Back to {returnTo.host}
    </a>
  );
}

export function SettledView({
  deposit,
  model,
  asset,
  sent,
  clock,
  returnTo,
}: {
  deposit: PayDeposit;
  model: PayModel;
  asset: ResolvedAsset;
  sent: SentPayment | null;
  clock: Clock;
  returnTo: ReturnTo | null;
}) {
  const { rows, anchor } = timelineRows({ deposit, model, asset, sent, offset: clock.offset });
  const network = asset.network;
  const detected = model.firstSeenAt;
  const settled = model.settledAt;
  const sentAt = sent ? sent.at + clock.offset : null;
  const amount = formatUnits(deposit.amount, deposit.token_decimals);
  const payerTxs = model.transfers.filter((t) => t.orphanedAt === null);

  return (
    <div className="pay-rise">
      <Heading tone="ok" title="Payment complete">
        <span className="tabular text-(--pay-ink)">
          {amount} {deposit.token}
        </span>{" "}
        on {network?.name ?? `chain ${deposit.chain_id}`} reached the recipient.
      </Heading>

      {detected !== null && settled !== null ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {sentAt !== null ? (
            <SpeedChip label="Detected" value={formatDuration(Math.max(0, detected - sentAt))} hint="after you sent it" />
          ) : null}
          <SpeedChip
            label="Settled"
            value={formatDuration(Math.max(0, settled - (sentAt ?? detected)))}
            hint={sentAt !== null ? "after you sent it" : "after it was detected"}
          />
        </div>
      ) : null}

      <div className="mt-5 rounded-xl border border-(--pay-line) px-4 py-4">
        <Timeline rows={rows} anchor={anchor} clock={clock} />
      </div>

      <dl className="mt-3 divide-y divide-(--pay-line) rounded-xl border border-(--pay-line) text-[13px]">
        <ReceiptRow label="Amount">
          <span className="tabular font-medium">
            {amount} {deposit.token}
          </span>
        </ReceiptRow>
        <ReceiptRow label="Network">
          <span className="flex items-center gap-1.5 font-medium">
            <ChainIcon src={network?.icon} />
            {network?.name ?? deposit.chain_id}
          </span>
        </ReceiptRow>
        <ReceiptRow label="Paid to">
          <ExternalLink href={explorerAddress(network, deposit.payment_address)} className="font-mono">
            {shortHex(deposit.payment_address, 6, 4)}
          </ExternalLink>
        </ReceiptRow>
        {payerTxs.map((t, i) => (
          <ReceiptRow key={t.key} label={payerTxs.length > 1 ? `Payment ${i + 1}` : "Your payment"}>
            <ExternalLink href={explorerTx(network, t.tx_hash)} className="font-mono">
              {shortHex(t.tx_hash, 6, 4)}
            </ExternalLink>
          </ReceiptRow>
        ))}
        {deposit.tx_hash ? (
          <ReceiptRow label="Settlement">
            <ExternalLink href={explorerTx(network, deposit.tx_hash)} className="font-mono">
              {shortHex(deposit.tx_hash, 6, 4)}
            </ExternalLink>
          </ReceiptRow>
        ) : null}
        <ReceiptRow label="Completed">
          <span suppressHydrationWarning>{formatDateFull(deposit.timestamps.settled_at)}</span>
        </ReceiptRow>
      </dl>

      <ReturnButton returnTo={returnTo} />
    </div>
  );
}

function SpeedChip({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="pay-pop flex items-center gap-2 rounded-full bg-(--pay-brand-soft) py-1.5 pr-3.5 pl-2.5 text-[12.5px]">
      <ZapIcon className="size-3.5 fill-(--pay-brand) text-(--pay-brand)" aria-hidden />
      <span>
        {label} in <strong className="tabular font-semibold">{value}</strong>{" "}
        <span className="text-(--pay-muted)">{hint}</span>
      </span>
    </div>
  );
}

function ReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-(--pay-muted)">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

export function FailedView({
  deposit,
  model,
  asset,
  sent,
  clock,
  returnTo,
}: {
  deposit: PayDeposit;
  model: PayModel;
  asset: ResolvedAsset;
  sent: SentPayment | null;
  clock: Clock;
  returnTo: ReturnTo | null;
}) {
  const { rows, anchor } = timelineRows({ deposit, model, asset, sent, offset: clock.offset });
  return (
    <div className="pay-rise">
      <Heading tone="warn" title="Payment received">
        Your{" "}
        <span className="tabular text-(--pay-ink)">
          {formatUnits(deposit.confirmed_amount, deposit.token_decimals)} {deposit.token}
        </span>{" "}
        arrived. Passing it on to the recipient hit a problem that Gum is resolving.{" "}
        <strong className="font-medium text-(--pay-ink)">Don&apos;t pay again.</strong>
      </Heading>
      <div className="mt-6 rounded-xl border border-(--pay-line) px-4 py-4">
        <Timeline rows={rows} anchor={anchor} clock={clock} />
      </div>
      {deposit.failure?.code ? (
        <p className="mt-3 text-center font-mono text-[11.5px] text-(--pay-faint)">{deposit.failure.code}</p>
      ) : null}
      <ReturnButton returnTo={returnTo} />
    </div>
  );
}

export function ExpiredView({
  deposit,
  model,
  returnTo,
}: {
  deposit: PayDeposit;
  model: PayModel;
  returnTo: ReturnTo | null;
}) {
  const received = model.received;
  return (
    <div className="pay-rise">
      {received > 0n ? (
        <Heading tone="muted" title="This request expired">
          <span className="tabular text-(--pay-ink)">
            {formatUnits(received.toString(), deposit.token_decimals)} of {formatUnits(deposit.amount, deposit.token_decimals)}{" "}
            {deposit.token}
          </span>{" "}
          arrived before it closed. That payment is held safely and can be recovered. Contact{" "}
          {returnTo ? returnTo.host : "the app that sent you here"}.
        </Heading>
      ) : (
        <Heading tone="muted" title="This request expired">
          It closed before anything was paid.{" "}
          <strong className="font-medium text-(--pay-ink)">Don&apos;t send anything to its address.</strong> Start a new
          payment from {returnTo ? returnTo.host : "the app that sent you here"}.
        </Heading>
      )}
      <ReturnButton returnTo={returnTo} />
    </div>
  );
}

export function NotFoundView() {
  return (
    <div className="pay-rise py-4">
      <Heading tone="muted" title="Payment not found">
        This link doesn&apos;t match a payment request. Check the link, or start again from the app that sent you here.
      </Heading>
    </div>
  );
}
