"use client";

import * as React from "react";
import type { Address, Hex } from "viem";
import { ClockIcon, CopyIcon, QrCodeIcon, TriangleAlertIcon, WalletIcon } from "lucide-react";
import { GumMark } from "@/components/brand/logo";
import { formatUnits } from "@/lib/format";
import type { DepositFeed } from "@/lib/pay/feed";
import { formatCountdown, payModel, type PayModel } from "@/lib/pay/model";
import { resolveAsset, type ResolvedAsset } from "@/lib/pay/networks";
import type { RoutesClient } from "@/lib/pay/routes/client";
import { simRoutesClient } from "@/lib/pay/routes/sim";
import { type RouteStatus } from "@/lib/pay/routes/types";
import type { Simulator } from "@/lib/pay/simulator";
import type { PayDeposit, PayStatus } from "@/lib/pay/types";
import { cn } from "@/lib/utils";
import { ChainIcon, Notice, Spinner, TokenMark, useNow } from "./bits";
import { AddressPane, QrPane } from "./manual";
import { ExpiredView, NotFoundView } from "./outcomes";
import { LifecycleView, type Clock, type ReturnTo } from "./progress";
import { usePayWith, type PayWith } from "./use-pay-with";
import { useSimWallet } from "./wallet/use-sim-wallet";
import { useWagmiWallet } from "./wallet/use-wagmi-wallet";
import type { WalletApi } from "./wallet/types";
import { WalletPane, type SentPayment } from "./wallet-pane";

export interface PayWidgetViewProps {
  feed: DepositFeed;
  /** Test mode: a simulated deposit and wallet. Omitted, the wallet is real (wagmi). */
  simulator?: Simulator;
  /**
   * Paying with any token on any chain (gum-server's Relay routes). Test mode brings its own;
   * omitted, the page offers the requested token only.
   */
  routes?: RoutesClient | null;
  returnTo?: ReturnTo | null;
  theme?: "light" | "dark";
  /** "page" draws the card; "embed" fills its container, for apps hosting the widget. */
  variant?: "page" | "embed";
  onStatusChange?: (status: PayStatus, deposit: PayDeposit) => void;
}

type Tab = "wallet" | "qr" | "address";

const WalletContext = React.createContext<WalletApi | null>(null);

function WagmiBridge({ target, children }: { target: { chainId: number; token: Address } | null; children: React.ReactNode }) {
  const api = useWagmiWallet(target);
  return <WalletContext.Provider value={api}>{children}</WalletContext.Provider>;
}

function SimBridge({ sim, children }: { sim: Simulator; children: React.ReactNode }) {
  const api = useSimWallet(sim);
  return <WalletContext.Provider value={api}>{children}</WalletContext.Provider>;
}

/** The payment this browser sent for a deposit, kept for the tab so a reload cannot double-pay. */
function useSentPayment(id: string | undefined, persist: boolean) {
  const key = id ? `gum:pay:sent:${id}` : null;
  const [sent, setSentState] = React.useState<SentPayment | null>(null);
  React.useEffect(() => {
    if (!key || !persist) return;
    try {
      const raw = window.sessionStorage.getItem(key);
      // Reading it on mount, not in render, keeps the server and client markup the same.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setSentState(JSON.parse(raw) as SentPayment);
    } catch {
      // Storage unavailable: the record lives in memory only.
    }
  }, [key, persist]);
  const setSent = React.useCallback(
    (next: SentPayment | null) => {
      setSentState(next);
      if (!key || !persist) return;
      try {
        if (next) window.sessionStorage.setItem(key, JSON.stringify(next));
        else window.sessionStorage.removeItem(key);
      } catch {
        // As above.
      }
    },
    [key, persist],
  );
  return [sent, setSent] as const;
}

export function PayWidgetView({
  feed,
  simulator,
  routes: liveRoutes = null,
  returnTo = null,
  theme = "light",
  variant = "page",
  onStatusChange,
}: PayWidgetViewProps) {
  React.useEffect(() => {
    feed.start();
    return () => feed.stop();
  }, [feed]);

  const snapshot = React.useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  const deposit = snapshot.deposit;
  const asset = React.useMemo(() => (deposit ? resolveAsset(deposit) : null), [deposit]);

  const target = asset?.verified ? { chainId: asset.network.chain.id, token: asset.token.address } : null;
  const routes = React.useMemo(() => (simulator ? simRoutesClient(simulator) : liveRoutes), [simulator, liveRoutes]);
  const inner = (
    <PayWidgetInner
      snapshot={snapshot}
      asset={asset}
      routes={routes}
      simulated={Boolean(simulator)}
      returnTo={returnTo}
      onStatusChange={onStatusChange}
    />
  );

  return (
    <div
      className={cn(
        "gum-pay w-full",
        variant === "page"
          ? "overflow-hidden rounded-[22px] border border-(--pay-line) bg-(--pay-card) shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.12)]"
          : "bg-(--pay-card)",
      )}
      data-theme={theme}
    >
      {simulator ? (
        <SimBridge sim={simulator}>{inner}</SimBridge>
      ) : (
        <WagmiBridge target={target}>{inner}</WagmiBridge>
      )}
    </div>
  );
}

/*
 * The widget never changes size. The header (amount, network, clock) is the same in every state,
 * and everything under it lives in one fixed frame: the ways to pay, then the lifecycle, then the
 * ending. Only what's inside the frame changes.
 */
const HEADER = "h-[81px]";
const FRAME = "h-[460px]";
/** The tabs (44px) and their gap (16px) come out of the frame; the panes get the rest. */
const PANE = "h-[400px]";

/**
 * A route this page sent, followed until it lands or Relay gives up on it (`onGiveUp`: refunded or
 * failed). A `failure` is not given up on: Relay's docs say a fill it reported failed may still
 * confirm, so the route stays owned — and paid, if the fill lands — until well past any chance of
 * it. Only a `refund` is settled knowledge that nothing more will arrive.
 */
function useRouteProgress(
  routes: RoutesClient | null,
  sent: SentPayment | null,
  onGiveUp: (status: "refund" | "failure", sent: SentPayment) => void,
): RouteStatus | null {
  const requestId = sent?.route?.requestId ?? null;
  const [status, setStatus] = React.useState<RouteStatus | null>(null);
  const latest = React.useRef({ sent, onGiveUp });
  React.useEffect(() => {
    latest.current = { sent, onGiveUp };
  });
  React.useEffect(() => {
    if (!routes || !requestId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    // Relay fills in seconds; a route still unsettled after this is left to the deposit's own feed.
    // A reported failure buys more waiting: only after it can a "pay again" be trusted.
    let giveUpAt = Date.now() + 15 * 60_000;
    const poll = async (delay: number) => {
      const next = await routes.status(requestId).catch(() => null);
      if (cancelled) return;
      if (Date.now() > giveUpAt) {
        const { sent, onGiveUp } = latest.current;
        if (sent) onGiveUp("failure", sent);
        return;
      }
      if (next) {
        setStatus(next);
        if (next.status === "failure") giveUpAt = Math.max(giveUpAt, Date.now() + 5 * 60_000);
        if (next.status === "refund") {
          const { sent, onGiveUp } = latest.current;
          if (sent) onGiveUp("refund", sent);
          return;
        }
        if (next.status === "success") return;
      }
      timer = setTimeout(() => void poll(Math.min(delay * 1.25, 5_000)), delay);
    };
    void poll(1_500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [routes, requestId]);
  return status && status.request_id === requestId ? status : null;
}

function PayWidgetInner({
  snapshot,
  asset,
  routes,
  simulated,
  returnTo,
  onStatusChange,
}: {
  snapshot: ReturnType<DepositFeed["getSnapshot"]>;
  asset: ResolvedAsset | null;
  routes: RoutesClient | null;
  simulated: boolean;
  returnTo: ReturnTo | null;
  onStatusChange?: PayWidgetViewProps["onStatusChange"];
}) {
  const wallet = React.useContext(WalletContext)!;
  const { deposit, notFound, clockOffset, clockError, connection } = snapshot;
  const [sent, setSent] = useSentPayment(deposit?.id, !simulated);
  const [tab, setTab] = React.useState<Tab>("wallet");
  const [walletNotice, setWalletNotice] = React.useState<string | null>(null);

  const open = deposit ? deposit.status === "pending" || deposit.status === "partial_paid" || deposit.status === "paid" : false;
  const now = useNow(open || sent !== null, 100);
  const clock: Clock = { now, offset: clockOffset, error: clockError ?? 0 };
  const model = deposit ? payModel(deposit, now + clockOffset) : null;
  const payWith = usePayWith({
    routes,
    wallet,
    deposit,
    asset,
    remaining: model?.remaining ?? 0n,
    active: model?.acceptsPayment ?? false,
    quoting: tab === "wallet" && sent === null && (model?.acceptsPayment ?? false),
  });
  // A route Relay gave up on: its funds go back to the payer, and the page asks for payment again.
  const routeStatus = useRouteProgress(routes, sent, (outcome, gaveUp) => {
    if (!gaveUp.route) return;
    const { symbol, chainName } = gaveUp.route;
    setSent(null);
    setWalletNotice(
      outcome === "refund"
        ? `Relay couldn't complete the route and refunded your ${symbol} on ${chainName}. Nothing was paid.`
        : `Relay couldn't complete the route, so nothing was paid. Check your ${symbol} on ${chainName} before trying again.`,
    );
  });

  // Tell whoever embeds the widget, once per status.
  const status = deposit?.status;
  React.useEffect(() => {
    if (!deposit || !status) return;
    onStatusChange?.(status, deposit);
    if (typeof window !== "undefined" && window.parent !== window) {
      window.parent.postMessage({ type: "gum:pay:status", id: deposit.id, status }, "*");
    }
    // Only a status change is news.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const onSent = React.useCallback(
    (payment: SentPayment) => {
      setWalletNotice(null);
      setSent({ ...payment, serverAt: payment.at + clockOffset });
    },
    [setSent, clockOffset],
  );

  const onReceipt = React.useCallback(
    (hash: Hex, result: "success" | "reverted") => {
      if (result !== "reverted") return;
      setSent(null);
      setWalletNotice(`Your transfer ${hash.slice(0, 10)}… failed on-chain. Nothing was paid; only gas was spent.`);
    },
    [setSent],
  );

  let content: React.ReactNode;
  if (notFound) {
    content = (
      <div className="h-[561px]">
        <NotFoundView />
      </div>
    );
  } else if (!deposit || !model || !asset) {
    content = <Skeleton />;
  } else {
    // A route's fill is Relay's transaction, not the payer's: it's known by Relay's hashes, or,
    // before Relay reports them, by a transfer of exactly the routed amount arriving after the send.
    const fills = new Set([sent?.hash, ...(routeStatus?.tx_hashes ?? [])].filter(Boolean).map((h) => h!.toLowerCase()));
    const sentAt = sent ? (sent.serverAt ?? sent.at + clockOffset) : 0;
    const sentIsKnown =
      sent !== null &&
      model.transfers.some(
        (t) =>
          fills.has(t.tx_hash.toLowerCase()) ||
          (sent.route !== undefined && t.seenAt >= sentAt && t.amountBase === BigInt(sent.amount)),
      );
    const waitingOnSent = sent !== null && !sentIsKnown && model.acceptsPayment;

    let body: React.ReactNode;
    if (model.phase === "expired") {
      body = <ExpiredView deposit={deposit} model={model} returnTo={returnTo} />;
    } else if (model.phase === "awaiting" || model.phase === "partial") {
      body = waitingOnSent ? (
        <LifecycleView
          deposit={deposit}
          model={model}
          asset={asset}
          sent={sent}
          routeStatus={routeStatus}
          clock={clock}
          returnTo={returnTo}
          onPayAgain={() => setSent(null)}
        />
      ) : (
        <PayView
          deposit={deposit}
          model={model}
          asset={asset}
          tab={tab}
          setTab={setTab}
          wallet={wallet}
          walletNotice={walletNotice}
          onSent={onSent}
          onReceipt={onReceipt}
          payWith={payWith}
          routes={routes}
          onClearNotice={() => setWalletNotice(null)}
        />
      );
    } else {
      body = (
        <LifecycleView deposit={deposit} model={model} asset={asset} sent={sent} routeStatus={routeStatus} clock={clock} returnTo={returnTo} />
      );
    }

    content = (
      <>
        <AmountHeader deposit={deposit} model={model} asset={asset} clock={clock} paying={!waitingOnSent} />
        <div className={cn("mt-5", FRAME)}>{body}</div>
      </>
    );
  }

  return (
    <div className="relative px-5 pt-5 pb-6 sm:px-6">
      {connection === "reconnecting" ? (
        // Over the card, not in it: the layout does not move.
        <p
          role="status"
          className="pay-rise absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-(--pay-line) bg-(--pay-card) px-3 py-1 text-[12px] whitespace-nowrap text-(--pay-muted) shadow-sm"
        >
          <Spinner className="size-3.5" />
          Reconnecting…
        </p>
      ) : null}
      {content}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse" aria-label="Loading payment">
      <div className={cn("flex flex-col", HEADER)}>
        <div className="flex h-[34px] items-center justify-between">
          <div className="h-8 w-44 rounded-lg bg-(--pay-sunk)" />
          <div className="h-6 w-16 rounded-full bg-(--pay-sunk)" />
        </div>
        <div className="mt-2 h-5 w-24 rounded bg-(--pay-sunk)" />
      </div>
      <div className={cn("mt-5 space-y-4", FRAME)}>
        <div className="h-11 rounded-xl bg-(--pay-sunk)" />
        <div className="h-56 rounded-xl bg-(--pay-sunk)" />
      </div>
    </div>
  );
}

function Countdown({ msLeft }: { msLeft: number }) {
  // Under two minutes a transfer may not land in time; the clock says so.
  const urgent = msLeft < 2 * 60_000;
  const soon = msLeft < 5 * 60_000;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        urgent ? "bg-(--pay-danger-soft) text-(--pay-danger)" : soon ? "bg-(--pay-warn-soft) text-(--pay-warn)" : "bg-(--pay-soft) text-(--pay-muted)",
      )}
      title={urgent ? "Only pay now if your transfer will land before the clock runs out" : "Time left to pay"}
    >
      <ClockIcon className={cn("size-3.5", urgent && "pay-urgent")} aria-hidden />
      <span className="tabular" suppressHydrationWarning>
        {formatCountdown(msLeft)}
      </span>
      <span className="sr-only">left to pay</span>
    </span>
  );
}

/**
 * Amount, network and clock: the same three lines in every state. While a request is part paid
 * the amount is what's left, the line under it says how much came in, and the rule under the
 * header fills in pink.
 */
function AmountHeader({
  deposit,
  model,
  asset,
  clock,
  paying,
}: {
  deposit: PayDeposit;
  model: PayModel;
  asset: ResolvedAsset;
  clock: Clock;
  /** False once this page has sent the payment and is waiting for it. */
  paying: boolean;
}) {
  const partial = model.phase === "partial" && paying;
  const shown = formatUnits((partial ? model.remaining : model.amount).toString(), deposit.token_decimals);
  const msLeft = model.expiresAt - (clock.now + clock.offset);
  const chainName = asset.verified ? asset.network.name : asset.chainName;
  const tokenIcon = asset.verified ? asset.token.icon : asset.tokenIcon;
  const pct = model.amount > 0n ? Math.min(100, Number((model.received * 1000n) / model.amount) / 10) : 0;
  const filled = model.phase === "settled" ? 100 : pct;

  // Only the clock lives here; outcomes are said once, in the frame below.
  const slot = model.acceptsPayment && paying ? <Countdown msLeft={msLeft} /> : null;

  return (
    <div className={cn("flex flex-col", HEADER)}>
      <div className="flex h-[34px] items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TokenMark tokenIcon={tokenIcon} size={34} />
          <p className="tabular text-[34px] leading-none font-semibold tracking-tight">
            <span key={shown} className={cn(partial && "pay-flash rounded-md")}>
              {shown}
            </span>{" "}
            <span className="text-[17px] font-medium tracking-normal text-(--pay-muted)">{deposit.token}</span>
          </p>
        </div>
        {slot}
      </div>
      <div className="mt-2 flex h-5 items-center justify-between gap-3 text-[13px] text-(--pay-muted)">
        <p className="flex items-center gap-1.5">
          on <ChainIcon src={asset.network?.icon} className="size-3.5" />
          <span className="font-medium text-(--pay-ink)">{chainName}</span>
        </p>
        {partial ? (
          <p className="tabular truncate text-[12.5px]">
            {formatUnits(model.received.toString(), deposit.token_decimals)} of {formatUnits(deposit.amount, deposit.token_decimals)} received
          </p>
        ) : null}
      </div>
      <div
        className="mt-4 h-[3px] overflow-hidden rounded-full bg-(--pay-line)"
        role="progressbar"
        aria-label="Received"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-(--pay-brand) transition-[width] duration-700" style={{ width: `${filled}%` }} />
      </div>
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "wallet", label: "Wallet", icon: <WalletIcon /> },
  { id: "qr", label: "QR code", icon: <QrCodeIcon /> },
  { id: "address", label: "Address", icon: <CopyIcon /> },
];

function PayView({
  deposit,
  model,
  asset,
  tab,
  setTab,
  wallet,
  walletNotice,
  onSent,
  onReceipt,
  payWith,
  routes,
  onClearNotice,
}: {
  deposit: PayDeposit;
  model: PayModel;
  asset: ResolvedAsset;
  tab: Tab;
  setTab: (tab: Tab) => void;
  wallet: WalletApi;
  walletNotice: string | null;
  onSent: (payment: SentPayment) => void;
  onReceipt: (hash: Hex, status: "success" | "reverted") => void;
  payWith: PayWith;
  routes: RoutesClient | null;
  onClearNotice: () => void;
}) {
  const tabRefs = React.useRef<Record<Tab, HTMLButtonElement | null>>({ wallet: null, qr: null, address: null });

  function onKey(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length] : e.key === "ArrowLeft" ? TABS[(i + TABS.length - 1) % TABS.length] : null;
    if (!next) return;
    e.preventDefault();
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="How to pay" onKeyDown={onKey} className="grid grid-cols-3 gap-1 rounded-xl bg-(--pay-soft) p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            role="tab"
            type="button"
            id={`pay-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`pay-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-[9px] text-[13px] font-medium transition-[background-color,color,box-shadow] [&_svg]:size-3.5",
              tab === t.id
                ? "bg-(--pay-card) text-(--pay-ink) shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--pay-line)]"
                : "text-(--pay-muted) hover:text-(--pay-ink)",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Fixed height; a rare pane taller than this scrolls inside it rather than growing the card. */}
      <div role="tabpanel" id={`pay-panel-${tab}`} aria-labelledby={`pay-tab-${tab}`} className={cn("mt-4 overflow-x-hidden overflow-y-auto", PANE)} key={tab}>
        {/* A column exactly the pane's height: panes grow to fill it, and a list inside can scroll. */}
        <div className="pay-fade flex h-full flex-col">
          {model.orphaned ? (
            <Notice tone="warn" icon={<TriangleAlertIcon />} className="mb-3">
              A transfer of{" "}
              <strong className="tabular">
                {formatUnits(model.orphaned.amountBase.toString(), deposit.token_decimals)} {deposit.token}
              </strong>{" "}
              was dropped by the network before it confirmed. If your wallet shows it failed, pay again.
            </Notice>
          ) : null}
          {tab === "wallet" ? (
            <>
              {/* Connected, the pane says it under its Pay button instead, where there's room. */}
              {walletNotice && wallet.status !== "connected" ? (
                <Notice tone="danger" icon={<TriangleAlertIcon />} className="mb-3">
                  {walletNotice}
                </Notice>
              ) : null}
              <WalletPane
                wallet={wallet}
                deposit={deposit}
                asset={asset}
                remaining={model.remaining}
                onSent={onSent}
                onReceipt={onReceipt}
                onUseQr={() => setTab("qr")}
                payWith={payWith}
                routes={routes}
                notice={walletNotice}
                onClearNotice={onClearNotice}
              />
            </>
          ) : tab === "qr" ? (
            <QrPane deposit={deposit} asset={asset} remaining={model.remaining} />
          ) : (
            <AddressPane deposit={deposit} asset={asset} remaining={model.remaining} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The Gum mark, small, for the page's footer. */
export function PoweredByGum() {
  return (
    <a
      href="https://gum.money"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-[12px] text-(--pay-muted) transition-colors hover:text-(--pay-ink)"
    >
      Payments by
      <GumMark className="size-4" />
      <span className="font-semibold text-(--pay-ink)">gum</span>
    </a>
  );
}
