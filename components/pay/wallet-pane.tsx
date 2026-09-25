"use client";

import * as React from "react";
import type { Address, Hex } from "viem";
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, TriangleAlertIcon, WalletIcon } from "lucide-react";
import { formatUnits, shortHex } from "@/lib/format";
import type { ResolvedAsset } from "@/lib/pay/networks";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { phantomBrowseLink, walletCountLabel, walletDeepLink } from "@/lib/pay/wallets";
import type { RoutesClient } from "@/lib/pay/routes/client";
import { ChainIcon, CopyPill, INLINE_LINK, Notice, Spinner, useCopied } from "./bits";
import { ExploreView, useWalletCount } from "./explore";
import { formatBalance, OptionMark, PayWithPicker } from "./pay-with";
import { QrCode } from "./qr-code";
import { RouteView } from "./route-view";
import type { PayWith } from "./use-pay-with";
import { isUnknownChain, walletErrorMessage } from "./wallet/errors";
import type { WalletApi, WalletOption } from "./wallet/types";

/** A few of the wallets behind "Explore wallets", as its icon. */
const EXPLORE_LOGOS = ["/logos/metamask.svg", "/logos/rainbow.svg", "/logos/trust.svg", "/logos/coinbase.svg"];

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "OP Mainnet",
  56: "BNB Chain",
  137: "Polygon",
  143: "Monad",
  8453: "Base",
  42161: "Arbitrum",
  5042: "Arc",
  43114: "Avalanche",
  11155111: "Sepolia",
};

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
  const [stage, setStage] = React.useState<null | "switching" | "signing">(null);
  /** The network row's own action, and whether the wallet turned out not to have the network. */
  const [networkBusy, setNetworkBusy] = React.useState<null | "switching" | "adding">(null);
  const [needsAdd, setNeedsAdd] = React.useState(false);
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
  /** The "Pay with" list, in place of the card. */
  const [choosing, setChoosing] = React.useState(false);

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
  const busy = stage !== null || payWith.executing;

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

  const selected = payWith.selected;
  const routing = payWith.isRoute && selected !== null;

  if (choosing) {
    return (
      <PayWithPicker
        payWith={payWith}
        connected={connected}
        onPick={(option) => {
          payWith.select(option);
          setChoosing(false);
          setError(null);
          onClearNotice?.();
        }}
        onBack={() => setChoosing(false)}
      />
    );
  }

  const header = (
    <div className="flex h-[60px] items-center gap-3 px-3.5">
      {wallet.walletIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wallet.walletIcon} alt="" width={30} height={30} className="size-[30px] rounded-[10px]" />
      ) : (
        <span className="flex size-[30px] items-center justify-center rounded-[10px] bg-(--pay-sunk)">
          <WalletIcon className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[14px] leading-tight font-medium">{shortHex(wallet.address ?? "", 6, 4)}</p>
        <p className="text-[12px] leading-tight text-(--pay-muted)">{wallet.walletName ?? "Wallet"}</p>
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
  );

  // What's being paid with. Opens the list when there's anything else to pay with.
  const choosable = payWith.available;
  const selectedBalance = routing ? selected.balance : wallet.tokenBalance;
  const payWithRow = selected ? (
    <button
      type="button"
      onClick={() => choosable && setChoosing(true)}
      disabled={busy || !choosable}
      aria-label={choosable ? `Pay with ${selected.token.symbol} on ${selected.chain.name}. Change` : undefined}
      className={cn(
        "group flex h-[72px] w-full items-center gap-3 border-t border-(--pay-line) px-3.5 text-left",
        choosable && "transition-colors hover:bg-(--pay-soft) disabled:hover:bg-transparent",
      )}
    >
      <OptionMark option={selected} size={34} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] leading-tight font-medium tracking-wide text-(--pay-faint) uppercase">Pay with</span>
        <span className="mt-0.5 block truncate text-[15px] leading-tight font-semibold">
          {selected.token.symbol} <span className="font-normal text-(--pay-muted)">on {selected.chain.name}</span>
        </span>
        <span className="tabular mt-0.5 block truncate text-[12px] leading-tight text-(--pay-muted)">
          {selectedBalance === undefined ? (
            <span className="inline-block h-2.5 w-16 animate-pulse rounded bg-(--pay-sunk) align-middle" aria-label="loading balance" />
          ) : (
            <>Balance {formatBalance(selectedBalance, selected.token.decimals)}</>
          )}
        </span>
      </span>
      {choosable ? (
        <span className="flex items-center gap-0.5 rounded-full border border-(--pay-line) px-2.5 py-1 text-[12.5px] font-medium text-(--pay-muted) transition-colors group-hover:text-(--pay-ink)">
          Change
          <ChevronRightIcon className="size-3.5" />
        </span>
      ) : null}
    </button>
  ) : null;

  if (routing) {
    return (
      <RouteView
        wallet={wallet}
        deposit={deposit}
        asset={asset}
        remaining={remaining}
        payWith={payWith}
        routes={routes}
        header={header}
        payWithRow={payWithRow}
        onSent={onSent}
        onChoose={() => setChoosing(true)}
        notice={notice}
      />
    );
  }

  const onChain = wallet.chainId === target.chain.id;
  const currentChain = wallet.chainId ? (CHAIN_NAMES[wallet.chainId] ?? `chain ${wallet.chainId}`) : "an unknown network";
  const insufficient = wallet.tokenBalance !== undefined && wallet.tokenBalance < remaining;
  const noGas = wallet.nativeBalance !== undefined && wallet.nativeBalance === 0n;
  // A wallet without the network can't be switched by paying; it needs "Add" first.
  const blocked = insufficient || noGas || remaining <= 0n || (!onChain && needsAdd);

  const label = (() => {
    if (stage === "switching") return `Switching to ${target.name}…`;
    if (stage === "signing") return `Confirm in ${wallet.walletName ?? "your wallet"}…`;
    if (insufficient) return `Not enough ${token.symbol}`;
    if (noGas) return `No ${target.nativeSymbol} for gas`;
    return `Pay ${shown} ${token.symbol}`;
  })();

  /** Switch first; if the wallet doesn't know the network, the button becomes "Add <network>". */
  async function switchNetwork() {
    setError(null);
    const adding = needsAdd;
    setNetworkBusy(adding ? "adding" : "switching");
    try {
      if (adding) await wallet.addChain(target.chain.id);
      else await wallet.switchChain(target.chain.id);
      setNeedsAdd(false);
    } catch (cause) {
      if (!adding && isUnknownChain(cause)) setNeedsAdd(true);
      else setError(walletErrorMessage(cause, "network"));
    } finally {
      setNetworkBusy(null);
    }
  }

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
      if (isUnknownChain(cause)) setNeedsAdd(true);
      else setError(walletErrorMessage(cause));
    } finally {
      setStage(null);
    }
  }

  const suggestion = insufficient ? payWith.suggestion : null;

  // A roomy card at the top, the Pay button pinned to the bottom of the pane.
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col rounded-xl border border-(--pay-line)">
        {header}
        {payWithRow}
        <dl className="flex flex-col border-t border-(--pay-line) text-[14px]">
          <div className="flex h-[64px] items-center justify-between gap-3 px-3.5">
            <dt className="text-(--pay-muted)">Network</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              {onChain ? (
                <>
                  <ChainIcon src={target.icon} />
                  {target.name}
                  <CheckIcon className="size-3.5 text-(--pay-ok)" aria-label="correct network" />
                </>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={switchNetwork}
                    disabled={networkBusy !== null || busy}
                    className="flex h-8 items-center gap-1.5 rounded-full bg-(--pay-button) pr-3.5 pl-2.5 text-[13px] font-semibold text-(--pay-button-ink) transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {networkBusy ? <Spinner className="size-3.5" /> : <ChainIcon src={target.icon} className="size-4 rounded-full bg-white" />}
                    {networkBusy === "adding"
                      ? `Adding ${target.name}…`
                      : networkBusy === "switching"
                        ? `Switching…`
                        : needsAdd
                          ? `Add ${target.name}`
                          : `Switch to ${target.name}`}
                  </button>
                  <span className="text-[11.5px] font-normal text-(--pay-muted)">
                    {needsAdd ? `Not in your wallet yet` : `Wallet is on ${currentChain}`}
                  </span>
                </div>
              )}
            </dd>
          </div>
          <div className="flex h-[64px] items-center justify-between gap-3 border-t border-(--pay-line) px-3.5">
            <dt className="text-(--pay-muted)">You pay</dt>
            <dd className={cn("tabular flex items-center gap-1.5 font-medium", insufficient && "text-(--pay-danger)")}>
              {shown} {token.symbol}
              {wallet.tokenBalance !== undefined && !insufficient ? (
                <CheckIcon className="size-3.5 text-(--pay-ok)" aria-label="balance covers it" />
              ) : null}
            </dd>
          </div>
        </dl>
      </div>

      <button
        type="button"
        onClick={pay}
        disabled={busy || blocked}
        className="mt-auto flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-(--pay-button) text-[15px] font-semibold text-(--pay-button-ink) transition-[transform,opacity,background-color] hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? <Spinner /> : null}
        {label}
      </button>

      {error || notice ? (
        <p role="alert" className="px-1 text-center text-[13px] text-(--pay-danger)">
          {error ?? notice}
        </p>
      ) : suggestion ? (
        <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
          Not enough {token.symbol} on {target.name}.{" "}
          <button type="button" onClick={() => payWith.select(suggestion)} className={INLINE_LINK}>
            Pay with {suggestion.token.symbol} on {suggestion.chain.name}
          </button>
        </p>
      ) : insufficient ? (
        <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
          This wallet holds {formatUnits((wallet.tokenBalance ?? 0n).toString(), token.decimals)} {token.symbol} on {target.name}.{" "}
          {payWith.available ? (
            <button type="button" onClick={() => setChoosing(true)} className={INLINE_LINK}>
              Pay with another token
            </button>
          ) : (
            <button type="button" onClick={onUseQr} className={INLINE_LINK}>
              Pay from another wallet
            </button>
          )}
        </p>
      ) : noGas ? (
        <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
          Sending on {target.name} needs a little {target.nativeSymbol} for gas, and this wallet has none.
          {payWith.available ? (
            <>
              {" "}
              <button type="button" onClick={() => setChoosing(true)} className={INLINE_LINK}>
                Pay from another network
              </button>
            </>
          ) : null}
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
