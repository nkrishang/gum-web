"use client";

import * as React from "react";
import type { Hex } from "viem";
import { ArrowLeftIcon, ChevronRightIcon, TriangleAlertIcon, WalletIcon } from "lucide-react";
import type { ResolvedAsset } from "@/lib/pay/networks";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { phantomBrowseLink, walletCountLabel, walletDeepLink } from "@/lib/pay/wallets";
import type { RoutesClient } from "@/lib/pay/routes/client";
import { CopyPill, INLINE_LINK, Notice, Spinner, useCopied } from "./bits";
import { ExploreView, useWalletCount } from "./explore";
import { PayPanel } from "./pay-panel";
import { QrCode } from "./qr-code";
import type { PayWith } from "./use-pay-with";
import { walletErrorMessage } from "./wallet/errors";
import type { WalletApi, WalletOption } from "./wallet/types";

/** A few of the wallets behind "Explore wallets", as its icon. */
const EXPLORE_LOGOS = ["/logos/metamask.svg", "/logos/rainbow.svg", "/logos/trust.svg", "/logos/coinbase.svg"];

export interface SentPayment {
  hash: Hex;
  /** Client clock, ms. */
  at: number;
  /**
   * The same moment on the server's clock, converted once when it happened, so later clock
   * measurements can't move the latencies counted from it.
   */
  serverAt?: number;
  amount: string;
  from?: string;
  reverted?: boolean;
  /** Paid through a Relay route from another token or chain: `hash` is its origin transaction. */
  route?: SentRoute;
}

export interface SentRoute {
  requestId: string;
  chainId: number;
  chainName: string;
  chainIcon?: string | null;
  explorer: string;
  symbol: string;
  logo?: string;
  /** What left the payer's wallet, base units. */
  amount: string;
  decimals: number;
  timeEstimateSecs?: number;
}

/**
 * Paying from a connected wallet, in the requested token on the requested chain (the default), is
 * one plain ERC-20 `transfer` to the payment address: no approval, no contract call, nothing that
 * could send the funds anywhere else. Anything else the wallet holds, on any chain Relay supports,
 * is offered under "Pay with" and paid through a route gum-server has pinned to this payment (see
 * `RouteView`). The amount is read
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
  payWith,
  routes,
  notice = null,
  onClearNotice,
}: {
  wallet: WalletApi;
  deposit: PayDeposit;
  asset: ResolvedAsset;
  remaining: bigint;
  onSent: (payment: SentPayment) => void;
  onReceipt: (hash: Hex, status: "success" | "reverted") => void;
  onUseQr: () => void;
  payWith: PayWith;
  routes: RoutesClient | null;
  /** What happened to the last payment (it reverted, or its route was refunded). */
  notice?: string | null;
  onClearNotice?: () => void;
}) {
  const [connecting, setConnecting] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** A popular wallet being paired over WalletConnect: its QR code (or deep link) while we wait. */
  const [pairing, setPairing] = React.useState<{ option: WalletOption; uri: string | null; mobile: boolean } | null>(null);
  /** Bumped by each connect and by "All wallets", so an abandoned attempt's failure stays quiet. */
  const attempt = React.useRef(0);
  /** The full directory, in place of the list, after "Explore wallets". */
  const [exploring, setExploring] = React.useState(false);
  const [exploreSearch, setExploreSearch] = React.useState("");
  const exploreCount = useWalletCount(asset.verified ? asset.network.chain.id : null);

  if (!asset.verified) {
    return (
      <Notice tone="warn" icon={<TriangleAlertIcon />}>
        {asset.reason} Paying from a connected wallet is off for this request. Use the QR code or the address, and
        double-check the network and token.
      </Notice>
    );
  }

  const target = asset.network;
  const connected = wallet.status === "connected" && Boolean(wallet.address);

  const connectWith = async (option: WalletOption) => {
    const mine = ++attempt.current;
    setError(null);
    // On a phone a wallet with an app link opens it; elsewhere its QR code is scanned with one.
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
      await wallet.connect(option, (uri) => {
        setPairing((p) => (p && p.option.id === option.id ? { ...p, uri } : p));
        if (mobile && option.mobileLink) window.location.assign(walletDeepLink(option.mobileLink, uri));
      });
      setPairing(null);
      setExploring(false);
    } catch (cause) {
      if (mine === attempt.current) setError(walletErrorMessage(cause, "connect"));
    } finally {
      if (mine === attempt.current) setConnecting(null);
    }
  };

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

  if (!connected && exploring) {
    return (
      <ExploreView
        chainId={target.chain.id}
        networkName={target.name}
        connecting={connecting}
        error={error}
        search={exploreSearch}
        onSearch={setExploreSearch}
        onPick={connectWith}
        onBack={() => {
          setExploring(false);
          setExploreSearch("");
          setError(null);
        }}
      />
    );
  }

  if (!connected) {
    return (
      <div className="space-y-2">
        <p className="px-1 pb-1 text-[13px] text-(--pay-muted)">
          {payWith.available ? "Pay on this page with any token, from any network." : "Pay on this page directly."}
        </p>
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
            onClick={() => (option.kind === "explore" ? setExploring(true) : connectWith(option))}
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
            ) : option.kind === "explore" && exploreCount !== null && walletCountLabel(exploreCount) ? (
              <span className="tabular rounded-full bg-(--pay-soft) px-2 py-0.5 text-[11.5px] font-medium text-(--pay-muted)">
                {walletCountLabel(exploreCount)}
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

  return (
    <PayPanel
      wallet={wallet}
      deposit={deposit}
      asset={asset}
      remaining={remaining}
      payWith={payWith}
      routes={routes}
      notice={notice}
      onSent={onSent}
      onReceipt={onReceipt}
      onUseQr={onUseQr}
      onClearNotice={onClearNotice}
    />
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
  const { option, uri } = pairing;
  const handoff = option.via === "handoff";
  // A phone opens the wallet's app when it has a link for it; otherwise it gets the code and a
  // link to copy into the wallet, like a computer does.
  const mobile = pairing.mobile && Boolean(option.mobileLink);
  const { copied, copy } = useCopied();
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
                {uri ? (
                  <CopyPill className="mt-3" label="Copy connection link" copied={copied === "uri"} onCopy={() => void copy("uri", uri)} />
                ) : null}
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
