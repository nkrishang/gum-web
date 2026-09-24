"use client";

import * as React from "react";
import { formatUnits as viemFormatUnits } from "viem";
import { ScanLineIcon, TriangleAlertIcon } from "lucide-react";
import { formatUnits } from "@/lib/format";
import { eip681, type ResolvedAsset } from "@/lib/pay/networks";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { ChainIcon, CopyPill, INLINE_LINK, Notice, useCopied } from "./bits";
import { QrCode } from "./qr-code";

interface PaneProps {
  deposit: PayDeposit;
  asset: ResolvedAsset;
  remaining: bigint;
}

function chainLabel(asset: ResolvedAsset) {
  return asset.verified ? asset.network.name : asset.chainName;
}

function chainIcon(asset: ResolvedAsset) {
  return asset.network?.icon ?? null;
}

/** The one thing a manual payment must get right, said before anything else. */
export function NetworkGuard({ deposit, asset }: { deposit: PayDeposit; asset: ResolvedAsset }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-(--pay-line) bg-(--pay-soft) px-3.5 py-2.5 text-[13px]">
      <ChainIcon src={chainIcon(asset)} className="size-5" />
      <p className="min-w-0 flex-1 leading-snug">
        Send only <strong className="font-semibold">{deposit.token}</strong> on{" "}
        <strong className="font-semibold">{chainLabel(asset)}</strong>
        <span className="text-(--pay-muted)">. Other tokens and networks aren&apos;t credited.</span>
      </p>
    </div>
  );
}

export function QrPane({ deposit, asset, remaining }: PaneProps) {
  // A payment request pre-fills the network, token and amount. A few wallets can only read a bare
  // address; for them the payer can fall back, knowing they then choose all three by hand.
  const [kind, setKind] = React.useState<"request" | "address">(asset.verified ? "request" : "address");
  const value =
    kind === "request" && asset.verified
      ? eip681({ chainId: asset.network.chain.id, token: asset.token.address, to: asset.paymentAddress, amount: remaining })
      : deposit.payment_address;
  const shown = formatUnits(remaining.toString(), deposit.token_decimals);
  const logo = asset.verified ? asset.token.icon : asset.tokenIcon;

  return (
    <div className="space-y-4">
      <NetworkGuard deposit={deposit} asset={asset} />
      <div className="flex flex-col items-center">
        <div className="rounded-2xl border border-(--pay-line) bg-white p-3 shadow-[0_1px_0_rgb(0_0_0/0.02)]">
          <QrCode
            key={value}
            value={value}
            logo={logo}
            size={212}
            label={
              kind === "request"
                ? `Payment request: ${shown} ${deposit.token} on ${chainLabel(asset)} to ${deposit.payment_address}`
                : `Payment address ${deposit.payment_address}`
            }
          />
        </div>
        {kind === "request" ? (
          <p className="mt-3 max-w-[300px] text-center text-[13px] leading-relaxed text-(--pay-muted)">
            <ScanLineIcon className="-mt-0.5 mr-1 inline size-3.5" aria-hidden />
            Scan with your phone&apos;s wallet. It fills in{" "}
            <span className="text-(--pay-ink)">
              {shown} {deposit.token}
            </span>{" "}
            on <span className="text-(--pay-ink)">{chainLabel(asset)}</span> for you.
          </p>
        ) : (
          <Notice tone="warn" icon={<TriangleAlertIcon />} className="mt-3 w-full">
            This code holds only the address. In your wallet, pick <strong>{deposit.token}</strong> on{" "}
            <strong>{chainLabel(asset)}</strong> and enter{" "}
            <strong className="tabular">{shown}</strong> yourself.
          </Notice>
        )}
        {asset.verified ? (
          <button
            type="button"
            onClick={() => setKind(kind === "request" ? "address" : "request")}
            className={cn("mt-2.5 text-[12.5px]", INLINE_LINK)}
          >
            {kind === "request" ? "Wallet can't read it? Show a plain address code" : "Show the payment request code"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AddressPane({ deposit, asset, remaining }: PaneProps) {
  const { copied, copy } = useCopied();
  const address = asset.verified ? asset.paymentAddress : deposit.payment_address;
  const exact = viemFormatUnits(remaining, deposit.token_decimals);
  const shown = formatUnits(remaining.toString(), deposit.token_decimals);

  // The card fills the pane: its rows share the height, the address getting the most of it.
  return (
    <div className="flex flex-1 flex-col gap-3">
      <NetworkGuard deposit={deposit} asset={asset} />

      <div className="flex flex-1 flex-col rounded-xl border border-(--pay-line)">
        <div className="flex min-h-[104px] flex-[1.6] flex-col justify-center gap-2.5 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium tracking-wide text-(--pay-muted) uppercase">Payment address</p>
            <CopyPill label="Copy address" copied={copied === "address"} onCopy={() => void copy("address", address)} />
          </div>
          {/* One line wherever it fits (13px mono fits the card from sm up); wraps on phones. */}
          <p className="font-mono text-[13px] leading-relaxed break-all sm:break-normal sm:whitespace-nowrap" translate="no">
            {address}
          </p>
        </div>
        <div className="flex min-h-[76px] flex-1 items-center justify-between gap-3 border-t border-(--pay-line) px-3.5 py-3">
          <div>
            <p className="text-[12px] font-medium tracking-wide text-(--pay-muted) uppercase">Amount</p>
            <p className="tabular mt-1 text-[20px] leading-tight font-semibold tracking-tight">
              {shown} <span className="text-[15px] font-medium tracking-normal text-(--pay-muted)">{deposit.token}</span>
            </p>
          </div>
          <CopyPill label="Copy amount" copied={copied === "amount"} onCopy={() => void copy("amount", exact)} />
        </div>
        <div className="flex min-h-[52px] flex-[0.7] items-center justify-between gap-3 border-t border-(--pay-line) px-3.5 py-3">
          <p className="text-[12px] font-medium tracking-wide text-(--pay-muted) uppercase">Network</p>
          <p className="flex items-center gap-1.5 text-[14px] font-medium">
            <ChainIcon src={chainIcon(asset)} />
            {chainLabel(asset)}
            <span className="font-normal text-(--pay-faint)">· {deposit.chain_id}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
