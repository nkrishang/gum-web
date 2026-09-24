"use client";

import * as React from "react";
import type { Address, Hex } from "viem";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronRightIcon, TriangleAlertIcon, WalletIcon } from "lucide-react";
import { formatUnits, shortHex } from "@/lib/format";
import type { ResolvedAsset } from "@/lib/pay/networks";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { ChainIcon, INLINE_LINK, Notice, Spinner } from "./bits";
import { walletErrorMessage } from "./wallet/errors";
import { phantomBrowseLink, walletDeepLink } from "@/lib/pay/wallets";
import { QrCode } from "./qr-code";
import type { WalletApi, WalletOption } from "./wallet/types";

/** A few of the wallets behind "Explore wallets", as its icon. */
const EXPLORE_LOGOS = ["/logos/metamask.svg", "/logos/rainbow.svg", "/logos/trust.svg", "/logos/coinbase.svg"];
/** Wallets the WalletConnect modal lists for EVM chains ("340+" in September 2026), rounded down. */
const EXPLORE_COUNT = "300+";

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
  /** A popular wallet being paired over WalletConnect: its QR code (or deep link) while we wait. */
  const [pairing, setPairing] = React.useState<{ option: WalletOption; uri: string | null; mobile: boolean } | null>(null);
  /** Bumped by each connect and by "All wallets", so an abandoned attempt's failure stays quiet. */
  const attempt = React.useRef(0);

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

  if (!connected && pairing) {
    return (
      <PairingView
        pairing={pairing}
        error={error}
        onBack={() => {
          attempt.current++;
          wallet.cancelConnect();
          setPairing(null);
          setConnecting(null);
          setError(null);
        }}
      />
    );
  }

  if (!connected) {
    const connectWith = async (option: WalletOption) => {
      const mine = ++attempt.current;
      setError(null);
      // On a phone a popular wallet opens its app; elsewhere its QR code is scanned with one.
      const mobile = window.matchMedia("(pointer: coarse)").matches;
      if (option.via === "handoff") {
        // Nothing connects here: the payment page opens in the wallet's own browser and is paid
        // there, while this page follows the deposit.
        const link = phantomBrowseLink(window.location.href);
        wallet.onHandoff(option.id);
        if (mobile) window.location.assign(link);
        else setPairing({ option, uri: link, mobile });
        return;
      }
      setConnecting(option.id);
      if (option.via === "walletconnect") setPairing({ option, uri: null, mobile });
      try {
        await wallet.connect(option.id, (uri) => {
          setPairing((p) => (p && p.option.id === option.id ? { ...p, uri } : p));
          if (mobile && option.mobileLink) window.location.assign(walletDeepLink(option.mobileLink, uri));
        });
        setPairing(null);
      } catch (cause) {
        if (mine === attempt.current) setError(walletErrorMessage(cause, "connect"));
      } finally {
        if (mine === attempt.current) setConnecting(null);
      }
    };

    return (
      <div className="space-y-2">
        <p className="px-1 pb-1 text-[13px] text-(--pay-muted)">Pay on this page directly.</p>
        {!wallet.optionsReady ? (
          Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[52px] animate-pulse rounded-xl bg-(--pay-soft)" />)
        ) : wallet.options.length === 0 ? (
          <Notice icon={<WalletIcon />}>
            No wallet found in this browser.{" "}
            <button type="button" onClick={onUseQr} className={INLINE_LINK}>
              Scan the QR code
            </button>{" "}
            with your phone&apos;s wallet instead.
          </Notice>
        ) : null}
        {wallet.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={connecting !== null}
            onClick={() => connectWith(option)}
            className="group flex h-[52px] w-full items-center gap-3 rounded-xl border border-(--pay-line) bg-(--pay-card) px-3.5 text-left transition-colors hover:border-(--pay-ink)/25 hover:bg-(--pay-soft) disabled:opacity-60"
          >
            {option.kind === "explore" ? (
              <span className="grid size-7 grid-cols-2 gap-[2px] rounded-lg bg-(--pay-soft) p-[3px]" aria-hidden>
                {EXPLORE_LOGOS.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="" width={11} height={11} className="size-full rounded-[3px] object-contain" />
                ))}
              </span>
            ) : option.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={option.icon} alt="" width={28} height={28} className="size-7 rounded-lg" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-lg bg-(--pay-sunk)">
                <WalletIcon className="size-4" />
              </span>
            )}
            <span className="flex-1 text-[14.5px] font-medium">{option.name}</span>
            {option.kind === "installed" ? (
              <span className="text-[12px] text-(--pay-faint)">Detected</span>
            ) : option.kind === "explore" ? (
              <span className="tabular rounded-full bg-(--pay-soft) px-2 py-0.5 text-[11.5px] font-medium text-(--pay-muted)">
                {EXPLORE_COUNT}
              </span>
            ) : null}
            {connecting === option.id ? (
              <Spinner className="text-(--pay-muted)" />
            ) : (
              <ChevronRightIcon className="size-4 text-(--pay-faint) transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        ))}
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

  // A roomy card at the top, the Pay button pinned to the bottom of the pane.
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col rounded-xl border border-(--pay-line)">
        <div className="flex h-[84px] items-center gap-3 px-3.5">
          {wallet.walletIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.walletIcon} alt="" width={36} height={36} className="size-9 rounded-xl" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-xl bg-(--pay-sunk)">
              <WalletIcon className="size-4.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[14.5px] font-medium">{shortHex(wallet.address ?? "", 6, 4)}</p>
            <p className="text-[12.5px] text-(--pay-muted)">{wallet.walletName ?? "Wallet"}</p>
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
        <dl className="flex flex-col border-t border-(--pay-line) text-[14px]">
          <div className="flex h-16 items-center justify-between gap-3 px-3.5">
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
          <div className="flex h-16 items-center justify-between gap-3 border-t border-(--pay-line) px-3.5">
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
        className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-(--pay-button) text-[15px] font-semibold text-(--pay-button-ink) transition-[transform,opacity,background-color] hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
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

/**
 * Pairing a popular wallet over WalletConnect, inside the pane: on a computer, a QR code for that
 * wallet's app to scan; on a phone, the app opens by itself, with a button in case it didn't.
 */
function PairingView({
  pairing,
  error,
  onBack,
}: {
  pairing: { option: WalletOption; uri: string | null; mobile: boolean };
  error: string | null;
  onBack: () => void;
}) {
  const { option, uri, mobile } = pairing;
  const handoff = option.via === "handoff";
  return (
    <div className="flex flex-1 flex-col">
      <button type="button" onClick={onBack} className={cn("flex items-center gap-1 self-start px-1 text-[13px]", INLINE_LINK)}>
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        All wallets
      </button>
      <div className="flex flex-1 flex-col items-center justify-center pt-3">
        {mobile ? (
          <>
            {option.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={option.icon} alt="" width={56} height={56} className="size-14 rounded-2xl" />
            ) : null}
            <p className="mt-4 text-[15px] font-semibold">Opening {option.name}…</p>
            <p className="mt-1 text-center text-[13px] text-(--pay-muted)">Approve the connection there, then come back here to pay.</p>
            {uri && option.mobileLink ? (
              <a
                href={walletDeepLink(option.mobileLink, uri)}
                className="mt-5 flex h-11 items-center justify-center rounded-xl bg-(--pay-button) px-5 text-[14px] font-semibold text-(--pay-button-ink)"
              >
                Open {option.name}
              </a>
            ) : null}
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-(--pay-line) bg-white p-3">
              {uri ? (
                <QrCode
                  value={uri}
                  logo={option.icon}
                  size={212}
                  label={handoff ? `Scan to open this payment in ${option.name}` : `Scan with ${option.name} to connect`}
                />
              ) : (
                <div className="size-[212px] animate-pulse rounded-lg bg-(--pay-soft)" aria-label="Preparing the code" />
              )}
            </div>
            {handoff ? (
              <>
                <p className="mt-4 text-[15px] font-semibold">Pay in {option.name} on your phone</p>
                <p className="mt-1 text-center text-[13px] text-(--pay-muted)">
                  Scan with your camera to open this payment in {option.name}. This page updates when it arrives.
                </p>
                <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className={cn("mt-2 text-[12.5px]", INLINE_LINK)}>
                  Or add {option.name} to this browser
                </a>
              </>
            ) : (
              <>
                <p className="mt-4 text-[15px] font-semibold">Scan with {option.name}</p>
                <p className="mt-1 text-center text-[13px] text-(--pay-muted)">
                  Open {option.name} on your phone and scan to connect.
                </p>
              </>
            )}
          </>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-center text-[13px] text-(--pay-danger)">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
