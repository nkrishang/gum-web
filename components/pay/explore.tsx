"use client";

import * as React from "react";
import { ArrowLeftIcon, ChevronRightIcon, QrCodeIcon, SearchIcon, WalletIcon } from "lucide-react";
import type { RegistryWallet, WalletPage } from "@/lib/pay/wallets";
import { cn } from "@/lib/utils";
import { INLINE_LINK, Spinner } from "./bits";
import type { WalletOption } from "./wallet/types";

async function fetchPage(chainId: number, search: string, page: number, signal?: AbortSignal): Promise<WalletPage> {
  const params = new URLSearchParams({ chain: String(chainId), page: String(page) });
  if (search) params.set("search", search);
  const res = await fetch(`/api/wallets?${params}`, { signal });
  if (!res.ok) throw new Error(`wallets ${res.status}`);
  return res.json();
}

/**
 * How many directory wallets support this network, for the "Explore wallets" row. It is the
 * explore list's own first page, so opening the list afterwards comes from the browser's cache.
 */
export function useWalletCount(chainId: number | null): number | null {
  const [count, setCount] = React.useState<{ chainId: number; count: number } | null>(null);
  React.useEffect(() => {
    if (chainId === null) return;
    const controller = new AbortController();
    fetchPage(chainId, "", 1, controller.signal)
      .then((page) => setCount({ chainId, count: page.count }))
      .catch(() => {});
    return () => controller.abort();
  }, [chainId]);
  return count && count.chainId === chainId ? count.count : null;
}

type Listing = {
  key: string;
  wallets: RegistryWallet[];
  count: number;
  pages: number;
  status: "ready" | "error";
};

/** The directory for a network and a search, a page at a time. */
function useWalletDirectory(chainId: number, search: string) {
  const key = `${chainId}|${search}`;
  const [listing, setListing] = React.useState<Listing | null>(null);
  const loadingMore = React.useRef(false);
  const [retry, setRetry] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    // Typing waits a beat; the unfiltered list loads at once.
    const timer = setTimeout(
      () => {
        fetchPage(chainId, search, 1, controller.signal)
          .then((page) => setListing({ key, wallets: page.wallets, count: page.count, pages: 1, status: "ready" }))
          .catch(() => {
            if (!controller.signal.aborted) setListing({ key, wallets: [], count: 0, pages: 0, status: "error" });
          });
      },
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [chainId, search, key, retry]);

  const current = listing && listing.key === key ? listing : null;

  const loadMore = React.useCallback(() => {
    if (!current || current.status !== "ready" || current.wallets.length >= current.count || loadingMore.current) return;
    loadingMore.current = true;
    fetchPage(chainId, search, current.pages + 1)
      .then((page) =>
        setListing((l) => {
          if (!l || l.key !== key) return l;
          const seen = new Set(l.wallets.map((w) => w.id));
          return { ...l, wallets: [...l.wallets, ...page.wallets.filter((w) => !seen.has(w.id))], pages: l.pages + 1 };
        }),
      )
      .catch(() => {})
      .finally(() => {
        loadingMore.current = false;
      });
  }, [chainId, search, key, current]);

  return { listing: current, loadMore, retry: () => setRetry((n) => n + 1) };
}

/** Pairs with any WalletConnect wallet: a plain QR code, named in the session once scanned. */
export const ANY_WALLET: WalletOption = { id: "walletconnect:any", name: "your wallet", kind: "popular", via: "walletconnect" };

/**
 * Every wallet WalletConnect lists for the payment's network, in the pane's own frame: search,
 * a code for any wallet, and the directory, loading more as it scrolls. Picking one pairs with it
 * the same way as a popular wallet.
 */
export function ExploreView({
  chainId,
  networkName,
  connecting,
  error,
  search,
  onSearch,
  onPick,
  onBack,
}: {
  chainId: number;
  networkName: string;
  connecting: string | null;
  error: string | null;
  /** Kept by the pane, so a trip to a wallet's code and back keeps the search. */
  search: string;
  onSearch: (search: string) => void;
  onPick: (option: WalletOption) => void;
  onBack: () => void;
}) {
  const query = search.trim();
  const { listing, loadMore, retry } = useWalletDirectory(chainId, query);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) loadMore();
  }

  const row =
    "group flex h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left transition-colors hover:bg-(--pay-soft) disabled:opacity-60";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button type="button" onClick={onBack} className={cn("flex items-center gap-1 self-start px-1 text-[13px]", INLINE_LINK)}>
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        All wallets
      </button>

      <label className="mt-3 flex h-10 shrink-0 items-center gap-2 rounded-xl border border-(--pay-line) bg-(--pay-card) px-3 focus-within:border-(--pay-ink)/30">
        <SearchIcon className="size-4 text-(--pay-faint)" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={listing && listing.count && !query ? `Search ${listing.count} wallets on ${networkName}` : "Search wallets"}
          aria-label="Search wallets"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-(--pay-faint)"
        />
      </label>

      <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1" onScroll={onScroll}>
        {!query ? (
          <button type="button" disabled={connecting !== null} onClick={() => onPick(ANY_WALLET)} className={row}>
            <span className="flex size-7 items-center justify-center rounded-lg bg-(--pay-sunk)">
              <QrCodeIcon className="size-4" />
            </span>
            <span className="flex-1 text-[14px] font-medium">Scan with any wallet</span>
            {connecting === ANY_WALLET.id ? <Spinner className="text-(--pay-muted)" /> : <Chevron />}
          </button>
        ) : null}

        {!listing ? (
          Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-12 items-center gap-3 px-2.5">
              <span className="size-7 animate-pulse rounded-lg bg-(--pay-soft)" />
              <span className="h-3.5 w-32 animate-pulse rounded bg-(--pay-soft)" />
            </div>
          ))
        ) : listing.status === "error" ? (
          <p className="px-2.5 py-4 text-[13px] text-(--pay-muted)">
            Couldn&apos;t load wallets.{" "}
            <button type="button" onClick={retry} className={INLINE_LINK}>
              Try again
            </button>
          </p>
        ) : listing.wallets.length === 0 ? (
          <p className="px-2.5 py-4 text-[13px] text-(--pay-muted)">No wallets on {networkName} match &ldquo;{query}&rdquo;.</p>
        ) : (
          listing.wallets.map((w) => {
            const option: WalletOption = {
              id: `walletconnect:${w.id}`,
              name: w.name,
              icon: w.image,
              kind: "popular",
              via: "walletconnect",
              mobileLink: w.mobileLink,
            };
            return (
              <button key={w.id} type="button" disabled={connecting !== null} onClick={() => onPick(option)} className={row}>
                {w.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.image} alt="" width={28} height={28} loading="lazy" className="size-7 rounded-lg bg-(--pay-soft)" />
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-lg bg-(--pay-sunk)">
                    <WalletIcon className="size-4" />
                  </span>
                )}
                <span className="flex-1 truncate text-[14px] font-medium">{w.name}</span>
                {connecting === option.id ? <Spinner className="text-(--pay-muted)" /> : <Chevron />}
              </button>
            );
          })
        )}
        {listing && listing.status === "ready" && listing.wallets.length < listing.count ? (
          <div className="flex h-10 items-center justify-center">
            <Spinner className="text-(--pay-faint)" />
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="shrink-0 px-1 pt-2 text-[13px] text-(--pay-danger)">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Chevron() {
  return <ChevronRightIcon className="size-4 text-(--pay-faint) transition-transform group-hover:translate-x-0.5" />;
}
