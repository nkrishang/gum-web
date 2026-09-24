"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { formatUnits } from "@/lib/format";
import type { ResolvedAsset } from "@/lib/pay/networks";
import type { RouteError, RoutesClient } from "@/lib/pay/routes/client";
import type { RouteStage } from "@/lib/pay/routes/execute";
import type { RouteQuote } from "@/lib/pay/routes/types";
import type { PayDeposit } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { INLINE_LINK, Spinner } from "./bits";
import { formatBalance, formatUsd } from "./pay-with";
import { QUOTE_TTL_MS, type PayWith } from "./use-pay-with";
import { walletErrorMessage } from "./wallet/errors";
import type { WalletApi } from "./wallet/types";
import type { SentPayment } from "./wallet-pane";

/**
 * Paying with another token or from another chain. gum-server quotes a Relay route that delivers
 * exactly what's owed, in the requested token, to this payment's address, and refunds the payer
 * on the origin chain if it can't. The card shows what leaves the wallet and what the route costs;
 * paying sends the route's origin transactions (an approval first when the token needs one), and
 * the page then follows the route until the payment lands.
 */
export function RouteView({
  wallet,
  deposit,
  asset,
  remaining,
  payWith,
  routes,
  header,
  payWithRow,
  onSent,
  onChoose,
  notice = null,
}: {
  wallet: WalletApi;
  deposit: PayDeposit;
  asset: ResolvedAsset;
  remaining: bigint;
  payWith: PayWith;
  routes: RoutesClient | null;
  header: React.ReactNode;
  payWithRow: React.ReactNode;
  onSent: (payment: SentPayment) => void;
  onChoose: () => void;
  notice?: string | null;
}) {
  const [stage, setStage] = React.useState<RouteStage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const selected = payWith.selected!;
  const { status, quote, error: quoteError } = payWith.quote;
  const busy = stage !== null;

  const owed = formatUnits(remaining.toString(), deposit.token_decimals);
  const destination = asset.verified ? asset.network.name : `chain ${deposit.chain_id}`;
  const native = payWith.nativeBalance(selected.chain.id);
  const gas = quote?.fees.gas ? BigInt(quote.fees.gas.amount) : 0n;
  const spend = quote ? BigInt(quote.origin.amount) + (selected.native ? gas : 0n) : null;
  const insufficient = spend !== null && selected.balance !== undefined && selected.balance < spend;
  const noGas = !selected.native && native !== undefined && native === 0n;
  const ready = status === "ready" && quote !== undefined;

  const label = (() => {
    if (stage?.kind === "switching") return `Switching to ${stage.chain}…`;
    if (stage?.kind === "confirming") return `Waiting for the approval to confirm…`;
    if (stage?.kind === "signing") {
      const of = stage.total > 1 ? ` (${stage.index + 1} of ${stage.total})` : "";
      if (stage.step.id === "approve" || stage.step.id === "approval") return `Approve ${selected.token.symbol} in wallet${of}`;
      return `Confirm in ${wallet.walletName ?? "your wallet"}${of}`;
    }
    if (status === "error") return "Try again";
    if (!ready) return "Finding the best route…";
    if (insufficient) return `Not enough ${selected.token.symbol}`;
    if (noGas) return `No ${selected.chain.native.symbol} for gas`;
    return `Pay ${formatBalance(quote.origin.amount, quote.origin.currency.decimals)} ${selected.token.symbol}`;
  })();

  async function pay() {
    if (busy) return;
    setError(null);
    if (status === "error") {
      await payWith.refreshQuote();
      return;
    }
    payWith.hold(true);
    try {
      // A quote the payer has been looking at for a while is fetched again: Relay prices it at fill.
      let route: RouteQuote | null | undefined = quote;
      const stale = !payWith.quote.at || Date.now() - payWith.quote.at > QUOTE_TTL_MS;
      if (!route || stale || route.destination.amount !== remaining.toString()) route = await payWith.refreshQuote();
      if (!route) return;
      // The fresh quote may ask for more than the balance the button was enabled for.
      const needs = BigInt(route.origin.amount) + (selected.native && route.fees.gas ? BigInt(route.fees.gas.amount) : 0n);
      if (selected.balance !== undefined && selected.balance < needs) {
        setError(`The price moved: this now needs ${formatBalance(needs, route.origin.currency.decimals)} ${selected.token.symbol}.`);
        return;
      }
      const hash = await wallet.executeRoute(route, selected.chain, setStage);
      void routes?.sent(route.request_id, hash, selected.chain.id);
      onSent({
        hash,
        at: Date.now(),
        amount: route.destination.amount,
        from: wallet.address,
        route: {
          requestId: route.request_id,
          chainId: selected.chain.id,
          chainName: selected.chain.name,
          chainIcon: selected.chain.icon_url,
          explorer: selected.chain.explorer_url,
          symbol: selected.token.symbol,
          logo: selected.token.logo_uri,
          amount: route.origin.amount,
          decimals: route.origin.currency.decimals,
          timeEstimateSecs: route.time_estimate_secs,
        },
      });
    } catch (cause) {
      setError(walletErrorMessage(cause));
    } finally {
      setStage(null);
      payWith.hold(false);
    }
  }

  const fees = quote ? formatUsd(Number(quote.fees.route_usd ?? "0")) : null;
  const gasUsd = quote?.fees.gas?.amount_usd ? formatUsd(Number(quote.fees.gas.amount_usd)) : null;
  const eta = quote?.time_estimate_secs !== undefined ? formatEta(quote.time_estimate_secs) : null;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-col rounded-xl border border-(--pay-line)">
        {header}
        {payWithRow}
        <dl className="flex flex-col border-t border-(--pay-line) text-[14px]">
          <div className="flex h-[64px] items-center justify-between gap-3 px-3.5">
            <dt className="text-(--pay-muted)">You pay</dt>
            <dd className="flex flex-col items-end">
              {quote ? (
                <>
                  <span className={cn("tabular font-medium", insufficient && "text-(--pay-danger)", status === "loading" && "opacity-60")}>
                    {formatBalance(quote.origin.amount, quote.origin.currency.decimals)} {selected.token.symbol}
                  </span>
                  <span className="tabular text-[12px] text-(--pay-muted)">
                    {formatUsd(Number(quote.origin.amount_usd ?? "")) ?? " "} for {owed} {deposit.token}
                  </span>
                </>
              ) : status === "error" ? (
                <span className="max-w-[230px] text-right text-[12.5px] leading-snug text-(--pay-danger)">
                  {routeErrorCopy(quoteError, selected.token.symbol)}
                </span>
              ) : (
                <span className="h-3.5 w-28 animate-pulse rounded bg-(--pay-sunk)" aria-label="loading a quote" />
              )}
            </dd>
          </div>
          <div className="flex h-[64px] items-center justify-between gap-3 border-t border-(--pay-line) px-3.5">
            <dt className="text-(--pay-muted)">Route</dt>
            <dd className="flex flex-col items-end">
              {quote ? (
                <>
                  <span className="tabular flex items-center gap-1.5 font-medium">
                    {eta ? `${eta} · ` : ""}
                    {fees ?? "$0.00"} fee{gasUsd && gasUsd !== "$0.00" ? ` + ${gasUsd} gas` : ""}
                    <button
                      type="button"
                      onClick={() => void payWith.refreshQuote()}
                      disabled={busy || status === "loading"}
                      aria-label="Refresh the quote"
                      className="rounded-full p-0.5 text-(--pay-faint) transition-colors hover:text-(--pay-ink) disabled:opacity-50"
                    >
                      <RefreshCwIcon className={cn("size-3.5", status === "loading" && "animate-spin")} />
                    </button>
                  </span>
                  <span className="text-[12px] text-(--pay-muted)">
                    via{" "}
                    <a href="https://relay.link" target="_blank" rel="noreferrer" className={INLINE_LINK}>
                      Relay
                    </a>
                    {selected.chain.id === deposit.chain_id ? ", swapped on " : " to "}
                    {destination}
                  </span>
                </>
              ) : status === "error" ? (
                <button type="button" onClick={onChoose} className={cn("text-[13px]", INLINE_LINK)}>
                  Pay with something else
                </button>
              ) : (
                <span className="h-3.5 w-24 animate-pulse rounded bg-(--pay-sunk)" />
              )}
            </dd>
          </div>
        </dl>
      </div>

      <button
        type="button"
        onClick={pay}
        disabled={busy || (status !== "error" && (!ready || insufficient || noGas || remaining <= 0n))}
        className="mt-auto flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-(--pay-button) text-[15px] font-semibold text-(--pay-button-ink) transition-[transform,opacity,background-color] hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy || (status === "loading" && !quote) ? <Spinner /> : null}
        {label}
      </button>

      {error || notice ? (
        <p role="alert" className="px-1 text-center text-[12.5px] leading-snug text-(--pay-danger)">
          {error ?? notice}
        </p>
      ) : insufficient ? (
        <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
          This wallet holds {formatBalance(selected.balance ?? 0n, selected.token.decimals)} {selected.token.symbol} on{" "}
          {selected.chain.name}.{" "}
          <button type="button" onClick={onChoose} className={INLINE_LINK}>
            Pay with something else
          </button>
        </p>
      ) : noGas ? (
        <p className="px-1 text-center text-[12.5px] text-(--pay-muted)">
          Sending from {selected.chain.name} needs a little {selected.chain.native.symbol} for gas, and this wallet has none.
        </p>
      ) : (
        <p className="px-1 text-center text-[12px] text-(--pay-muted)">
          Arrives as exactly {owed} {deposit.token} on {destination}. If it can&apos;t, it&apos;s refunded to this wallet.
        </p>
      )}
    </div>
  );
}

/** gum-server's route errors, in the widget's words. */
function routeErrorCopy(error: RouteError | undefined, symbol: string): string {
  switch (error?.code) {
    case "no_route":
    case "route_unavailable":
      return `No route from ${symbol} right now.`;
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
