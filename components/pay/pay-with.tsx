"use client";

import * as React from "react";
import { ArrowLeftIcon, CheckIcon, SearchIcon } from "lucide-react";
import { formatUnits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { INLINE_LINK, Spinner } from "./bits";
import type { PayOption, PayWith } from "./use-pay-with";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function formatUsd(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value > 0 && value < 0.01) return "<$0.01";
  return usd.format(value);
}

/** A balance, short: whole units with up to 4 decimals (6 for small amounts). */
export function formatBalance(amount: bigint | string, decimals: number): string {
  const value = typeof amount === "bigint" ? amount : BigInt(amount);
  const small = value < 10n ** BigInt(Math.max(0, decimals - 2));
  return formatUnits(value.toString(), decimals, { minFraction: 0, maxFraction: Math.min(decimals, small ? 6 : 4) });
}

/** A token's logo with its chain's mark on the corner. Falls back to the symbol's first letters. */
export function AssetMark({
  logo,
  symbol,
  chainIcon,
  size = 32,
  className,
}: {
  logo?: string | null;
  symbol: string;
  chainIcon?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = React.useState<string | null>(null);
  const [chainBroken, setChainBroken] = React.useState<string | null>(null);
  const showLogo = logo && broken !== logo;
  const badge = Math.round(size * 0.46);
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={size} height={size} onError={() => setBroken(logo)} className="size-full rounded-full bg-(--pay-soft) object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-(--pay-sunk) text-[10px] font-semibold text-(--pay-muted) uppercase">
          {symbol.slice(0, 3)}
        </span>
      )}
      {chainIcon && chainBroken !== chainIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chainIcon}
          alt=""
          width={badge}
          height={badge}
          onError={() => setChainBroken(chainIcon)}
          className="absolute -right-1 -bottom-0.5 rounded-[5px] bg-(--pay-card) ring-2 ring-(--pay-card)"
          style={{ width: badge, height: badge }}
        />
      ) : null}
    </span>
  );
}

/** The page's own marks for the stablecoins it knows, where Relay has no logo. */
const LOCAL_ICONS: Record<string, string> = {
  USDC: "/payment-icons/usdc.svg",
  "USDC.E": "/payment-icons/usdc.svg",
  USDT: "/payment-icons/usdt.svg",
  USDT0: "/payment-icons/usdt.svg",
  "USD₮0": "/payment-icons/usdt.svg",
  GUSDT: "/payment-icons/usdt.svg",
  AUSD: "/payment-icons/ausd.svg",
};

export function OptionMark({ option, size }: { option: PayOption; size?: number }) {
  const logo = option.token.logo_uri ?? LOCAL_ICONS[option.token.symbol.toUpperCase()];
  return <AssetMark logo={logo} symbol={option.token.symbol} chainIcon={option.chain.icon_url} size={size} />;
}

/**
 * The "Pay with" list, in the pane's frame: the requested token first, then everything the wallet
 * holds on any chain Relay routes from, then (on search) any token Relay knows.
 */
export function PayWithPicker({
  payWith,
  connected,
  onPick,
  onBack,
}: {
  payWith: PayWith;
  connected: boolean;
  onPick: (option: PayOption) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [found, setFound] = React.useState<{ q: string; status: "loading" | "ready" | "error"; options: PayOption[] } | null>(null);
  const q = query.trim();

  React.useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setFound({ q, status: "loading", options: [] });
      payWith
        .search(q)
        .then((options) => !cancelled && setFound({ q, status: "ready", options }))
        .catch(() => !cancelled && setFound({ q, status: "error", options: [] }));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `payWith.search` changes as balances arrive; the query is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const needle = q.toLowerCase();
  // Word starts, so "eth" finds ETH and Ethereum but not Tether.
  const starts = (text: string) => text.toLowerCase().split(/[\s.()-]+/).some((word) => word.startsWith(needle));
  const matches = (o: PayOption) =>
    !needle || starts(o.token.symbol) || starts(o.token.name) || starts(o.chain.name) || o.token.address === needle;
  const listed = payWith.options.filter(matches);
  const listedKeys = new Set(listed.map((o) => o.key));
  const more = found && found.q === q && q.length >= 2 ? found.options.filter((o) => !listedKeys.has(o.key)) : [];
  const scan = payWith.scan;
  const others = payWith.options.length - 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className={cn("flex items-center gap-1 px-1 text-[13px]", INLINE_LINK)}>
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Back
        </button>
        <p className="text-[12px] text-(--pay-muted)" aria-live="polite">
          {scan ? (
            <span className="flex items-center gap-1.5">
              <Spinner className="size-3" />
              Checking {scan.done} of {scan.total} networks
            </span>
          ) : connected && payWith.available ? (
            `${others} other ${others === 1 ? "balance" : "balances"} found`
          ) : null}
        </p>
      </div>

      <label className="mt-3 flex h-10 shrink-0 items-center gap-2 rounded-xl border border-(--pay-line) bg-(--pay-card) px-3 focus-within:border-(--pay-ink)/30">
        <SearchIcon className="size-4 text-(--pay-faint)" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tokens, networks or an address"
          aria-label="Search tokens"
          autoComplete="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-(--pay-faint)"
        />
      </label>

      <div className="mt-2 -mx-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1" role="listbox" aria-label="Pay with">
        {listed.map((o) => (
          <OptionRow key={o.key} option={o} selected={payWith.selected?.key === o.key} onPick={onPick} />
        ))}
        {!q && connected && !scan && payWith.available && others === 0 ? (
          <p className="px-2.5 py-3 text-[12.5px] text-(--pay-muted)">No other tokens in this wallet on the networks Relay supports.</p>
        ) : null}
        {!connected && !q ? (
          <p className="px-2.5 py-3 text-[12.5px] text-(--pay-muted)">Connect a wallet to see what you can pay with.</p>
        ) : null}
        {q.length >= 2 ? (
          <>
            {more.length > 0 ? <p className="px-2.5 pt-3 pb-1 text-[11.5px] font-medium tracking-wide text-(--pay-faint) uppercase">More tokens</p> : null}
            {more.map((o) => (
              <OptionRow key={o.key} option={o} selected={payWith.selected?.key === o.key} onPick={onPick} />
            ))}
            {found?.q === q && found.status === "loading" ? (
              <div className="flex h-12 items-center justify-center">
                <Spinner className="text-(--pay-faint)" />
              </div>
            ) : found?.q === q && found.status !== "loading" && listed.length + more.length === 0 ? (
              <p className="px-2.5 py-3 text-[12.5px] text-(--pay-muted)">No tokens match &ldquo;{q}&rdquo;.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function OptionRow({ option, selected, onPick }: { option: PayOption; selected: boolean; onPick: (o: PayOption) => void }) {
  const short = option.covers === false;
  const value = formatUsd(option.usd);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onPick(option)}
      className={cn(
        "group flex h-[58px] w-full items-center gap-3 rounded-xl px-2.5 text-left transition-colors hover:bg-(--pay-soft)",
        selected && "bg-(--pay-soft)",
      )}
    >
      <OptionMark option={option} size={32} />
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-1.5 text-[14.5px] font-medium", short && "text-(--pay-muted)")}>
          <span className="truncate">{option.token.symbol}</span>
          {option.requested ? (
            <span className="rounded-full bg-(--pay-brand-soft) px-1.5 py-px text-[10.5px] font-semibold text-(--pay-ink)">Requested</span>
          ) : null}
        </span>
        <span className="block truncate text-[12.5px] text-(--pay-muted)">
          {option.chain.name}
          {option.requested ? " · no route needed" : short ? " · not enough" : ""}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        {option.balance !== undefined ? (
          <span className={cn("tabular text-[13.5px] font-medium", short && "text-(--pay-muted)")}>
            {formatBalance(option.balance, option.token.decimals)}
          </span>
        ) : null}
        {value ? <span className="tabular text-[12px] text-(--pay-muted)">{value}</span> : null}
      </span>
      <span className="flex w-4 shrink-0 justify-center">{selected ? <CheckIcon className="size-4 text-(--pay-ink)" aria-hidden /> : null}</span>
    </button>
  );
}
