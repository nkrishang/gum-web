"use client";

import * as React from "react";
import { ArrowUpRightIcon, CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The clock, ticking while `active`. Client ms. */
export function useNow(active: boolean, interval = 250): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [active, interval]);
  return now;
}

/** A token's icon with its network's mark tucked into the corner. */
export function TokenMark({
  tokenIcon,
  chainIcon,
  size = 28,
  className,
}: {
  tokenIcon: string | null;
  chainIcon?: string | null;
  size?: number;
  className?: string;
}) {
  const badge = Math.round(size * 0.5);
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {tokenIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tokenIcon} alt="" width={size} height={size} className="size-full rounded-full" />
      ) : (
        <span className="size-full rounded-full bg-(--pay-sunk)" />
      )}
      {chainIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chainIcon}
          alt=""
          width={badge}
          height={badge}
          className="absolute -right-1 -bottom-1 rounded-[5px] bg-(--pay-card) ring-2 ring-(--pay-card)"
          style={{ width: badge, height: badge }}
        />
      ) : null}
    </span>
  );
}

export function ChainIcon({ src, className }: { src: string | null | undefined; className?: string }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={16} height={16} className={cn("size-4 rounded-[4px]", className)} />;
}

export function useCopied(timeout = 1_600) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = React.useCallback(
    async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Blocked clipboard: the value stays on screen to select by hand.
        return false;
      }
      setCopied(key);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), timeout);
      return true;
    },
    [timeout],
  );
  return { copied, copy };
}

export function CopyPill({
  copied,
  onCopy,
  label = "Copy",
  className,
}: {
  copied: boolean;
  onCopy: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-(--pay-line) bg-(--pay-card) px-3 text-[12.5px] font-medium transition-colors hover:bg-(--pay-soft)",
        copied && "border-transparent bg-(--pay-ok-soft) text-(--pay-ok) hover:bg-(--pay-ok-soft)",
        className,
      )}
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn("inline-flex items-center gap-0.5 underline-offset-2 hover:underline", className)}
    >
      {children}
      <ArrowUpRightIcon className="size-3 opacity-60" aria-hidden />
    </a>
  );
}

/** "0x9a3F 5c1E … A0c2": groups of four, the ends in ink, so a pasted address is easy to check. */
export function GroupedAddress({ address, className }: { address: string; className?: string }) {
  const body = address.slice(2);
  const groups = body.match(/.{1,4}/g) ?? [body];
  return (
    <span className={cn("font-mono break-all", className)} translate="no">
      <span className="text-(--pay-ink)">0x</span>
      {groups.map((g, i) => {
        const edge = i === 0 || i === groups.length - 1;
        return (
          <React.Fragment key={i}>
            <span className={edge ? "font-semibold text-(--pay-ink)" : "text-(--pay-muted)"}>{g}</span>
            {i < groups.length - 1 ? <span className="inline-block w-[0.4ch]" /> : null}
          </React.Fragment>
        );
      })}
    </span>
  );
}

export function Notice({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: "neutral" | "warn" | "danger" | "ok" | "brand";
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-(--pay-soft) text-(--pay-muted)",
    warn: "bg-(--pay-warn-soft) text-(--pay-warn)",
    danger: "bg-(--pay-danger-soft) text-(--pay-danger)",
    ok: "bg-(--pay-ok-soft) text-(--pay-ok)",
    brand: "bg-(--pay-brand-soft) text-(--pay-ink)",
  } as const;
  return (
    <div className={cn("flex gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed", tones[tone], className)}>
      {icon ? <span className="mt-[3px] shrink-0 [&_svg]:size-3.5">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="pay-orbit" />
    </svg>
  );
}
