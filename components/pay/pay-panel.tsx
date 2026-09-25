"use client";

import * as React from "react";
import type { Address, Hex } from "viem";
import { ChevronRightIcon, RefreshCwIcon, WalletIcon } from "lucide-react";
import { formatUnits, shortHex } from "@/lib/format";
import type { ResolvedAsset } from "@/lib/pay/networks";
import type { RouteError, RoutesClient } from "@/lib/pay/routes/client";
import type { RouteStage } from "@/lib/pay/routes/execute";
import type { RouteQuote } from "@/lib/pay/routes/types";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { Spinner } from "./bits";
import { formatBalance, formatUsd, OptionMark, PayWithPicker } from "./pay-with";
import { QUOTE_TTL_MS, type PayOption, type PayWith } from "./use-pay-with";
import { isUnknownChain, walletErrorMessage } from "./wallet/errors";
import type { WalletApi } from "./wallet/types";
import type { SentPayment } from "./wallet-pane";

/** How many of the wallet's options sit in the pane before "All tokens". */
const SHORTLIST = 4;

type Stage = null | "switching" | "signing" | RouteStage;

/**
 * The connected wallet's pane, built around the one decision the payer makes: what to pay with.
 *
 * The header already says what the request is. Under it, the wallet's best ways to pay are the
 * choices themselves, each with what it costs in that token: the requested token first (a plain
 * transfer: exact, no fee), then whatever else covers the payment, same token on other chains
 * first. Picking one is the whole interaction; everything else the list can't show lives under
 * "All tokens". One quiet line says what the choice costs beyond the amount, and one button sends
 * exactly what it says. The wallet is a line at the top; networks switch when paying.
 */
export function PayPanel({
  wallet,
  deposit,
  asset,
  remaining,
  payWith,
  routes,
  notice,
  onSent,
  onReceipt,
  onUseQr,
  onClearNotice,
}: {
  wallet: WalletApi;
  deposit: PayDeposit;
  asset: Extract<ResolvedAsset, { verified: true }>;
  remaining: bigint;
  payWith: PayWith;
  routes: RoutesClient | null;
  notice: string | null;
  onSent: (payment: SentPayment) => void;
  onReceipt: (hash: Hex, status: "success" | "reverted") => void;
  onUseQr: () => void;
  onClearNotice?: () => void;
}) {
  const [stage, setStage] = React.useState<Stage>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [needsAdd, setNeedsAdd] = React.useState(false);
  const [choosing, setChoosing] = React.useState(false);
  const busy = stage !== null || payWith.executing;

  const network = asset.network;
  const token = asset.token;
  const selected = payWith.selected;

  const pick = (option: PayOption) => {
    payWith.select(option);
    setChoosing(false);
    setError(null);
    onClearNotice?.();
  };

  if (choosing) {
    return <PayWithPicker payWith={payWith} connected onPick={pick} onBack={() => setChoosing(false)} />;
  }
  if (!selected) return null;

  // ---- what the selection costs, and whether this wallet can pay it ------------------------------
  const routing = payWith.isRoute;
  const { status, quote, error: quoteError } = payWith.quote;
  const ready = !routing || (status === "ready" && quote !== undefined);
  const gas = quote?.fees.gas ? BigInt(quote.fees.gas.amount) : 0n;
  const sends = routing ? (quote ? BigInt(quote.origin.amount) : null) : remaining;
  const spend = sends === null ? null : sends + (routing && selected.native ? gas : 0n);
  const balance = routing ? selected.balance : wallet.tokenBalance;
  const insufficient = spend !== null && balance !== undefined && balance < spend;
  const native = routing ? payWith.nativeBalance(selected.chain.id) : wallet.nativeBalance;
  const noGas = !selected.native && native !== undefined && native === 0n;
  // The quote names the token's decimals, and the route is worth what those decimals say: a
  // disagreement with the token the payer chose is a route that can't be shown or signed.
  const mismatch = routing && quote !== undefined && quote.origin.currency.decimals !== selected.token.decimals;
  const gasSymbol = routing ? selected.chain.native.symbol : network.nativeSymbol;
  const gasChain = routing ? selected.chain.name : network.name;

  const label = (() => {
    if (stage === "switching") return `Switching to ${network.name}…`;
    if (stage === "signing") return `Confirm in ${wallet.walletName ?? "your wallet"}…`;
    if (stage && typeof stage === "object") {
      if (stage.kind === "switching") return `Switching to ${stage.chain}…`;
      if (stage.kind === "confirming") return "Waiting for the approval…";
      const of = stage.total > 1 ? ` (${stage.index + 1} of ${stage.total})` : "";
      if (stage.step.id === "approve" || stage.step.id === "approval") return `Approve ${selected.token.symbol} in your wallet${of}`;
      return `Confirm in ${wallet.walletName ?? "your wallet"}${of}`;
    }
    if (routing && status === "error") return "Try again";
    if (!ready || sends === null) return "Finding the best route…";
    if (needsAdd && !routing) return `Add ${network.name} to your wallet`;
    if (insufficient) return `Not enough ${selected.token.symbol}`;
    if (noGas) return `No ${gasSymbol} for gas on ${gasChain}`;
    const amount = routing ? formatBalance(sends, selected.token.decimals) : formatUnits(sends.toString(), token.decimals);
    return `Pay ${amount} ${selected.token.symbol}`;
  })();
  const disabled =
    busy || remaining <= 0n || mismatch || (!(routing && status === "error") && (!ready || (!needsAdd && (insufficient || noGas))));

  // ---- paying ---------------------------------------------------------------------------------------
  async function payDirect() {
    const amount = remaining;
    if (amount <= 0n) return;
    try {
      if (needsAdd) {
        setStage("switching");
        await wallet.addChain(network.chain.id);
        setNeedsAdd(false);
        return;
      }
      const hash = await wallet.transfer(
        { chainId: network.chain.id, token: token.address, to: asset.paymentAddress as Address, amount },
        setStage,
      );
      onSent({ hash, at: Date.now(), amount: amount.toString(), from: wallet.address });
      wallet.refreshBalances();
      wallet
        .waitForReceipt(hash, network.chain.id)
        .then((result) => onReceipt(hash, result))
        .catch(() => {
          // No receipt yet is not a failure; Gum's detection is the source of truth.
        });
    } catch (cause) {
      if (isUnknownChain(cause)) setNeedsAdd(true);
      else setError(walletErrorMessage(cause, needsAdd ? "network" : "transfer"));
    }
  }

  async function payRoute() {
    const option = selected!;
    // A quote the payer has been looking at for a while is fetched again: Relay prices it at fill.
    // The one taken is the one paid: a refresh mid-execution never swaps what's signed.
    let route: RouteQuote | null | undefined = quote;
    const stale = !payWith.quote.at || Date.now() - payWith.quote.at > QUOTE_TTL_MS;
    if (!route || stale || route.destination.amount !== remaining.toString()) route = await payWith.refreshQuote();
    if (!route) return;
    // The fresh quote may ask for more than the balance the button was enabled for.
    const needs = BigInt(route.origin.amount) + (option.native && route.fees.gas ? BigInt(route.fees.gas.amount) : 0n);
    if (option.balance !== undefined && option.balance < needs) {
      setError(`The price moved: this now needs ${formatBalance(needs, option.token.decimals)} ${option.token.symbol}.`);
      return;
    }
    if (route.origin.currency.decimals !== option.token.decimals) {
      setError("This route doesn't price the chosen token correctly. Try another.");
      return;
    }
    try {
      const hash = await wallet.executeRoute(route, option.chain, setStage);
      void routes?.sent(route.request_id, hash, option.chain.id);
      onSent({
        hash,
        at: Date.now(),
        amount: route.destination.amount,
        from: wallet.address,
        route: {
          requestId: route.request_id,
          chainId: option.chain.id,
          chainName: option.chain.name,
          chainIcon: option.chain.icon_url,
          explorer: option.chain.explorer_url,
          symbol: option.token.symbol,
          logo: option.token.logo_uri,
          amount: route.origin.amount,
          decimals: route.origin.currency.decimals,
          timeEstimateSecs: route.time_estimate_secs,
        },
      });
    } catch (cause) {
      setError(walletErrorMessage(cause));
    }
  }

  async function pay() {
    if (busy) return;
    if (routing && status === "error") {
      setError(null);
      await payWith.refreshQuote();
      return;
    }
    // Claimed before any await, so a second click (or a pick, or a disconnect) can't start a
    // second payment in the gap before the stage shows.
    if (!payWith.beginExecution()) return;
    setError(null);
    try {
      await (routing ? payRoute() : payDirect());
    } finally {
      setStage(null);
      payWith.endExecution();
    }
  }

  // ---- the shortlist --------------------------------------------------------------------------------
  // The requested token, then what covers the payment; the selection always stays in view.
  const others = payWith.options.filter((o) => !o.requested);
  const covering = others.filter((o) => o.covers !== false);
  let shortlist = payWith.options.filter((o) => o.requested).concat(covering.slice(0, SHORTLIST - 1));
  if (!shortlist.some((o) => o.key === selected.key)) shortlist = [...shortlist.slice(0, SHORTLIST - 1), selected];
  const hidden = payWith.options.length - shortlist.length;
  const scanning = payWith.scan !== null;

  const message = error ?? (mismatch ? "This route doesn't price the chosen token correctly; it can't be paid." : notice);

  return (
    <div className="flex flex-1 flex-col">
      <WalletLine wallet={wallet} disabled={busy} onDisconnect={() => {
          setError(null);
          wallet.disconnect();
        }} />

      <div className="mt-3 flex h-5 items-center justify-between px-1">
        <p className="text-[13px] font-medium text-(--pay-muted)">Pay with</p>
        {payWith.available ? (
          <button
            type="button"
            onClick={() => setChoosing(true)}
            disabled={busy}
            className="flex items-center gap-1 text-[12.5px] font-medium text-(--pay-muted) transition-colors hover:text-(--pay-ink) disabled:opacity-50"
          >
            {scanning ? <Spinner className="size-3" /> : null}
            {scanning ? "Checking your networks" : hidden > 0 ? `All tokens (${hidden + shortlist.length})` : "Search tokens"}
            <ChevronRightIcon className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div role="radiogroup" aria-label="Pay with" className="mt-2 flex flex-col gap-1.5">
        {shortlist.map((option) => (
          <Choice
            key={option.key}
            option={option}
            selected={option.key === selected.key}
            disabled={busy}
            onPick={() => pick(option)}
            deposit={deposit}
            remaining={remaining}
            quote={option.key === selected.key && routing ? payWith.quote : null}
            owedUsd={owedUsd(payWith, remaining, deposit.token_decimals)}
          />
        ))}
        {scanning && shortlist.length < 2 ? <div className="h-[54px] animate-pulse rounded-xl bg-(--pay-soft)" aria-hidden /> : null}
      </div>

      <div className="mt-auto flex flex-col gap-2.5 pt-3">
        <Terms
          routing={routing}
          status={status}
          quote={quote}
          quoteError={quoteError}
          symbol={selected.token.symbol}
          busy={busy}
          onRefresh={() => void payWith.refreshQuote()}
        />
        <button
          type="button"
          onClick={pay}
          disabled={disabled}
          className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-(--pay-button) text-[15px] font-semibold text-(--pay-button-ink) transition-[transform,opacity] hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy || (routing && status === "loading" && !quote) ? <Spinner /> : null}
          {label}
        </button>
        {message ? (
          <p role="alert" className="px-1 text-center text-[12.5px] leading-snug text-(--pay-danger)">
            {message}
          </p>
        ) : noGas && !insufficient ? (
          <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
            Sending from {gasChain} needs a little {gasSymbol} for gas.
            {!payWith.available ? (
              <>
                {" "}
                <button type="button" onClick={onUseQr} className="underline underline-offset-2">
                  Pay from another wallet
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Stablecoin deposits: what's owed, in USD, at the requested token's price (or $1). */
function owedUsd(payWith: PayWith, remaining: bigint, decimals: number): number {
  const requested = payWith.options.find((o) => o.requested);
  return (Number(remaining) / 10 ** decimals) * (requested?.price ?? 1);
}

function WalletLine({ wallet, disabled, onDisconnect }: { wallet: WalletApi; disabled: boolean; onDisconnect: () => void }) {
  return (
    <div className="flex h-8 items-center gap-2 px-1 text-[13px]">
      {wallet.walletIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wallet.walletIcon} alt="" width={18} height={18} className="size-[18px] rounded-[5px]" />
      ) : (
        <WalletIcon className="size-4 text-(--pay-muted)" aria-hidden />
      )}
      <span className="font-mono text-[12.5px] font-medium">{shortHex(wallet.address ?? "", 6, 4)}</span>
      <span className="truncate text-(--pay-faint)">{wallet.walletName ?? "Wallet"}</span>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disabled}
        className="ml-auto rounded-full px-2 py-0.5 text-[12.5px] text-(--pay-muted) transition-colors hover:bg-(--pay-soft) hover:text-(--pay-ink) disabled:opacity-50"
      >
        Disconnect
      </button>
    </div>
  );
}

/**
 * One way to pay: the token on its chain, what the wallet holds of it, and what paying with it
 * costs in it. Exact for the requested token and for the selected route once quoted; an estimate
 * (≈) from the token's price otherwise.
 */
function Choice({
  option,
  selected,
  disabled,
  onPick,
  deposit,
  remaining,
  quote,
  owedUsd,
}: {
  option: PayOption;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
  deposit: PayDeposit;
  remaining: bigint;
  quote: PayWith["quote"] | null;
  owedUsd: number;
}) {
  const short = option.covers === false;
  // A dollar value only says something when the token isn't worth about a dollar.
  const dollars = option.usd !== null && option.price !== null && Math.abs(option.price - 1) > 0.02;
  let cost: React.ReactNode;
  if (option.requested) {
    cost = formatUnits(remaining.toString(), deposit.token_decimals);
  } else if (quote?.quote) {
    cost = <span className={cn(quote.status === "loading" && "opacity-50")}>{formatBalance(quote.quote.origin.amount, option.token.decimals)}</span>;
  } else if (quote && quote.status === "loading") {
    cost = <span className="inline-block h-3.5 w-14 animate-pulse rounded bg-(--pay-sunk) align-middle" aria-label="getting a quote" />;
  } else if (option.price) {
    // Roughly what Relay charges on top (two cents and about a tenth of a percent, per its
    // quotes); the quote replaces it the moment this is picked.
    const units = (owedUsd * 1.001 + 0.02) / option.price;
    cost = (
      <>
        <span className="mr-px font-normal text-(--pay-faint)" aria-label="about">
          ≈
        </span>
        {units < 0.001 ? units.toPrecision(2) : units.toLocaleString("en-US", { maximumSignificantDigits: 4 })}
      </>
    );
  } else {
    // Priced a moment after the scan; until then, a placeholder rather than a dash.
    cost = <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-(--pay-sunk) align-middle" aria-label="pricing" />;
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      disabled={disabled && !selected}
      className={cn(
        "flex h-[54px] w-full items-center gap-3 rounded-xl border px-3 text-left transition-[border-color,background-color,box-shadow]",
        selected ? "border-(--pay-brand) bg-(--pay-brand-soft)" : "border-(--pay-line) hover:border-(--pay-ink)/30 hover:bg-(--pay-soft)",
        disabled && !selected && "opacity-50",
      )}
    >
      <OptionMark option={option} size={30} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[14.5px] leading-tight font-semibold">
          {option.token.symbol}
          <span className="truncate font-normal text-(--pay-muted)">on {option.chain.name}</span>
        </span>
        <span className={cn("tabular mt-0.5 block truncate text-[12px] leading-tight", short ? "text-(--pay-danger)" : "text-(--pay-faint)")}>
          {option.balance === undefined
            ? "Checking balance…"
            : short
              ? `Only ${formatBalance(option.balance, option.token.decimals)} in this wallet`
              : `${formatBalance(option.balance, option.token.decimals)} in wallet${dollars ? ` · ${formatUsd(option.usd)}` : ""}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="tabular text-[14.5px] leading-tight font-semibold">{cost}</span>
        <span className="mt-0.5 text-[11.5px] leading-tight text-(--pay-faint)">{option.requested ? "no fee" : option.token.symbol}</span>
      </span>
    </button>
  );
}

/**
 * One line under a route: when it lands and what happens if it doesn't. No fee: the row's amount
 * is everything that leaves the wallet, Relay's fee included. A direct transfer needs no line.
 */
function Terms({
  routing,
  status,
  quote,
  quoteError,
  symbol,
  busy,
  onRefresh,
}: {
  routing: boolean;
  status: PayWith["quote"]["status"];
  quote?: RouteQuote;
  quoteError?: RouteError;
  symbol: string;
  busy: boolean;
  onRefresh: () => void;
}) {
  const line = "flex min-h-5 items-center justify-center gap-1.5 px-1 text-center text-[12.5px] text-(--pay-muted)";
  if (!routing) return null;
  if (status === "error") return <p className={cn(line, "text-(--pay-danger)")}>{routeErrorCopy(quoteError, symbol)}</p>;
  if (!quote) return <p className={line}>Finding a route…</p>;
  const eta = quote.time_estimate_secs !== undefined ? formatEta(quote.time_estimate_secs) : null;
  return (
    <p className={line}>
      <span>
        {eta ? `Arrives in ${eta} via ` : "Via "}
        <a href="https://relay.link" target="_blank" rel="noreferrer" className="underline decoration-(--pay-faint)/70 underline-offset-2 hover:text-(--pay-ink)">
          Relay
        </a>
        . Refunded if it fails.
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy || status === "loading"}
        aria-label="Refresh the quote"
        className="rounded-full p-0.5 text-(--pay-faint) transition-colors hover:text-(--pay-ink) disabled:opacity-50"
      >
        <RefreshCwIcon className={cn("size-3", status === "loading" && "animate-spin")} />
      </button>
    </p>
  );
}

/** gum-server's route errors, in the widget's words. */
function routeErrorCopy(error: RouteError | undefined, symbol: string): string {
  switch (error?.code) {
    case "no_route":
    case "route_unavailable":
    case "route_rejected":
      return `No route from ${symbol} right now. Pick another.`;
    case "amount_too_low":
      return `This amount is too small to route from ${symbol}.`;
    case "insufficient_liquidity":
      return `Not enough liquidity to route ${symbol} for this amount.`;
    case "price_impact_too_high":
      return `${symbol}'s price impact is too high for this amount.`;
    case "blocked":
      return "Relay can't route from this wallet or token.";
    case "rate_limited":
      return "Too many quotes. Try again in a few seconds.";
    case "closing":
      return "This payment closes too soon to route. Pay in the requested token.";
    case "relay_unavailable":
    case "relay_disabled":
    case "unreachable":
      return "Routing is unavailable right now. Try again shortly.";
    default:
      return "Couldn't find a route. Try again.";
  }
}

function formatEta(secs: number): string {
  if (secs < 60) return `~${Math.max(1, Math.round(secs))}s`;
  return `~${Math.round(secs / 60)} min`;
}
