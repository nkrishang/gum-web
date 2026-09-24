"use client";

import * as React from "react";
import type { Address, Hex } from "viem";
import { ArrowRightIcon, CheckIcon, ChevronRightIcon, TriangleAlertIcon, WalletIcon } from "lucide-react";
import { formatUnits, shortHex } from "@/lib/format";
import type { ResolvedAsset } from "@/lib/pay/networks";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { ChainIcon, INLINE_LINK, Notice, Spinner } from "./bits";
import { walletErrorMessage } from "./wallet/errors";
import type { WalletApi } from "./wallet/types";

/** A few of the wallets behind "Explore wallets", as its icon. */
const EXPLORE_LOGOS = ["/logos/metamask.svg", "/logos/rainbow.svg", "/logos/trust.svg", "/logos/coinbase.svg"];
/** The WalletConnect catalogue the modal offers (616 wallets, September 2026), rounded down. */
const EXPLORE_COUNT = "600+";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "OP Mainnet",
  56: "BNB Chain",
  137: "Polygon",
  143: "Monad",
  8453: "Base",
  42161: "Arbitrum",
  43114: "Avalanche",
  11155111: "Sepolia",
};

export interface SentPayment {
  hash: Hex;
  /** Client clock, ms. */
  at: number;
  amount: string;
  from?: string;
  reverted?: boolean;
}

/**
 * Paying from a connected wallet is one plain ERC-20 `transfer` to the payment address: no
 * approval, no contract call, nothing that could send the funds anywhere else. The amount is read
 * from the newest deposit at the moment of the click, the wallet is moved to the deposit's chain
 * (and checked to have moved) first, and the transfer is dry-run before the wallet asks to sign.
 */
export function WalletPane({
  wallet,
  deposit,
  asset,
  remaining,
  onSent,
  onReceipt,
  onUseQr,
}: {
  wallet: WalletApi;
  deposit: PayDeposit;
  asset: ResolvedAsset;
  remaining: bigint;
  onSent: (payment: SentPayment) => void;
  onReceipt: (hash: Hex, status: "success" | "reverted") => void;
  onUseQr: () => void;
}) {
  const [stage, setStage] = React.useState<null | "switching" | "signing">(null);
  const [connecting, setConnecting] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!asset.verified) {
    return (
      <Notice tone="warn" icon={<TriangleAlertIcon />}>
        {asset.reason} Paying from a connected wallet is off for this request. Use the QR code or the address, and
        double-check the network and token.
      </Notice>
    );
  }

  const target = asset.network;
  const token = asset.token;
  const shown = formatUnits(remaining.toString(), token.decimals);
  const connected = wallet.status === "connected" && Boolean(wallet.address);

  if (!connected) {
    const installed = wallet.options.filter((o) => o.kind === "installed");
    const explore = wallet.options.filter((o) => o.kind === "explore");
    const connectWith = async (id: string) => {
      setError(null);
      setConnecting(id);
      try {
        await wallet.connect(id);
      } catch (cause) {
        setError(walletErrorMessage(cause));
      } finally {
        setConnecting(null);
      }
    };
    const row =
      "group flex h-14 w-full items-center gap-3 rounded-xl border border-(--pay-line) bg-(--pay-card) px-3.5 text-left transition-colors hover:border-(--pay-ink)/25 hover:bg-(--pay-soft) disabled:opacity-60";

    return (
      <div className="space-y-2">
        <p className="px-1 pb-1 text-[13px] text-(--pay-muted)">Pay on this page directly.</p>
        {!wallet.optionsReady ? (
          <>
            <div className="h-14 animate-pulse rounded-xl bg-(--pay-soft)" />
            <div className="h-14 animate-pulse rounded-xl bg-(--pay-soft)" />
          </>
        ) : wallet.options.length === 0 ? (
          <Notice icon={<WalletIcon />}>
            No wallet found in this browser.{" "}
            <button type="button" onClick={onUseQr} className={INLINE_LINK}>
              Scan the QR code
            </button>{" "}
            with your phone&apos;s wallet instead.
          </Notice>
        ) : null}
        {installed.map((option) => (
          <button key={option.id} type="button" disabled={connecting !== null} onClick={() => connectWith(option.id)} className={row}>
            {option.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={option.icon} alt="" width={28} height={28} className="size-7 rounded-lg" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-lg bg-(--pay-sunk)">
                <WalletIcon className="size-4" />
              </span>
            )}
            <span className="flex-1 text-[14.5px] font-medium">{option.name}</span>
            <span className="text-[12px] text-(--pay-faint)">Detected</span>
            {connecting === option.id ? (
              <Spinner className="text-(--pay-muted)" />
            ) : (
              <ChevronRightIcon className="size-4 text-(--pay-faint) transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        ))}
        {explore.map((option) => (
          <button key={option.id} type="button" disabled={connecting !== null} onClick={() => connectWith(option.id)} className={row}>
            <span className="grid size-7 grid-cols-2 gap-[2px] rounded-lg bg-(--pay-soft) p-[3px]" aria-hidden>
              {EXPLORE_LOGOS.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" width={11} height={11} className="size-full rounded-[3px] object-contain" />
              ))}
            </span>
            <span className="flex-1 text-[14.5px] font-medium">{option.name}</span>
            <span className="rounded-full bg-(--pay-soft) px-2 py-0.5 text-[11.5px] font-medium text-(--pay-muted) tabular">
              {EXPLORE_COUNT}
            </span>
            {connecting === option.id ? (
              <Spinner className="text-(--pay-muted)" />
            ) : (
              <ChevronRightIcon className="size-4 text-(--pay-faint) transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        ))}
        {wallet.optionsReady && installed.length === 0 && explore.length > 0 ? (
          <p className="px-1 pt-1 text-[12.5px] text-(--pay-muted)">
            No wallet in this browser.{" "}
            <button type="button" onClick={onUseQr} className={INLINE_LINK}>
              Scan with your phone
            </button>{" "}
            instead.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="px-1 text-[13px] text-(--pay-danger)">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const onChain = wallet.chainId === target.chain.id;
  const currentChain = wallet.chainId ? (CHAIN_NAMES[wallet.chainId] ?? `chain ${wallet.chainId}`) : "an unknown network";
  const insufficient = wallet.tokenBalance !== undefined && wallet.tokenBalance < remaining;
  const noGas = wallet.nativeBalance !== undefined && wallet.nativeBalance === 0n;
  const blocked = insufficient || noGas || remaining <= 0n;
  const busy = stage !== null;

  const label = (() => {
    if (stage === "switching") return `Switching to ${target.name}…`;
    if (stage === "signing") return `Confirm in ${wallet.walletName ?? "your wallet"}…`;
    if (insufficient) return `Not enough ${token.symbol}`;
    if (noGas) return `No ${target.nativeSymbol} for gas`;
    if (!onChain) return `Switch to ${target.name} and pay`;
    return `Pay ${shown} ${token.symbol}`;
  })();

  // Recreated every render, so the click always reads the newest remaining amount.
  async function pay() {
    const amount = remaining;
    if (amount <= 0n || busy) return;
    setError(null);
    try {
      const hash = await wallet.transfer(
        { chainId: target.chain.id, token: token.address, to: asset.verified ? asset.paymentAddress : (deposit.payment_address as Address), amount },
        setStage,
      );
      onSent({ hash, at: Date.now(), amount: amount.toString(), from: wallet.address });
      wallet.refreshBalances();
      wallet
        .waitForReceipt(hash, target.chain.id)
        .then((status) => onReceipt(hash, status))
        .catch(() => {
          // No receipt yet is not a failure; Gum's detection is the source of truth.
        });
    } catch (cause) {
      setError(walletErrorMessage(cause));
    } finally {
      setStage(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-(--pay-line)">
        <div className="flex items-center gap-3 px-3.5 py-3">
          {wallet.walletIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.walletIcon} alt="" width={28} height={28} className="size-7 rounded-lg" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-lg bg-(--pay-sunk)">
              <WalletIcon className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[13.5px] font-medium">{shortHex(wallet.address ?? "", 6, 4)}</p>
            <p className="text-[12px] text-(--pay-muted)">{wallet.walletName ?? "Wallet"}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              wallet.disconnect();
            }}
            disabled={busy}
            className="rounded-full px-2.5 py-1 text-[12.5px] font-medium text-(--pay-muted) transition-colors hover:bg-(--pay-soft) hover:text-(--pay-ink)"
          >
            Disconnect
          </button>
        </div>
        <dl className="border-t border-(--pay-line) text-[13px]">
          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <dt className="text-(--pay-muted)">Network</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              {onChain ? (
                <>
                  <ChainIcon src={target.icon} />
                  {target.name}
                  <CheckIcon className="size-3.5 text-(--pay-ok)" aria-label="correct network" />
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-(--pay-warn)">
                  {currentChain}
                  <ArrowRightIcon className="size-3" aria-label="switches to" />
                  <ChainIcon src={target.icon} />
                  {target.name}
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-(--pay-line) px-3.5 py-2.5">
            <dt className="text-(--pay-muted)">Balance</dt>
            <dd className={cn("tabular flex items-center gap-1.5 font-medium", insufficient && "text-(--pay-danger)")}>
              {wallet.tokenBalance === undefined ? (
                <span className="h-3.5 w-20 animate-pulse rounded bg-(--pay-sunk)" aria-label="loading balance" />
              ) : (
                <>
                  {formatUnits(wallet.tokenBalance.toString(), token.decimals)} {token.symbol}
                  {!insufficient ? <CheckIcon className="size-3.5 text-(--pay-ok)" aria-label="enough" /> : null}
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {!onChain && !busy ? (
        <p className="px-1 text-[12.5px] text-(--pay-muted)">
          Your wallet is on {currentChain}. It&apos;ll be asked to switch to {target.name} first. This request is only
          paid on {target.name}.
        </p>
      ) : null}

      <button
        type="button"
        onClick={pay}
        disabled={busy || blocked}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-(--pay-button) text-[15px] font-semibold text-(--pay-button-ink) transition-[transform,opacity,background-color] hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? <Spinner /> : null}
        {label}
      </button>

      {insufficient ? (
        <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
          This wallet holds {formatUnits((wallet.tokenBalance ?? 0n).toString(), token.decimals)} {token.symbol} on{" "}
          {target.name}.{" "}
          <button type="button" onClick={onUseQr} className={INLINE_LINK}>
            Pay from another wallet
          </button>
        </p>
      ) : noGas ? (
        <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
          Sending on {target.name} needs a little {target.nativeSymbol} for gas, and this wallet has none.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="px-1 text-center text-[13px] text-(--pay-danger)">
          {error}
        </p>
      ) : null}
    </div>
  );
}
