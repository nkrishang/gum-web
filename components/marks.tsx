import Image from "next/image";
import { chainName } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The marks of the tokens and chains the API serves, with a lettered fallback for anything new. */

const TOKEN_MARKS: Record<string, string> = {
  USDC: "/payment-icons/usdc.svg",
  USDT: "/payment-icons/usdt.svg",
  AUSD: "/payment-icons/ausd.svg",
};

const CHAIN_MARKS: Record<number, string> = {
  8453: "/logos/base.svg",
  42161: "/logos/arbitrum.svg",
  143: "/payment-icons/monad.svg",
};

function Fallback({ letter, className }: { letter: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[9px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {letter}
    </span>
  );
}

export function TokenMark({ symbol, className }: { symbol: string; className?: string }) {
  const src = TOKEN_MARKS[symbol.toUpperCase()];
  if (!src) return <Fallback letter={symbol.slice(0, 1).toUpperCase()} className={cn("size-4", className)} />;
  return <Image src={src} width={32} height={32} alt="" className={cn("size-4 shrink-0 rounded-full", className)} />;
}

export function ChainMark({ chainId, className }: { chainId: number; className?: string }) {
  const src = CHAIN_MARKS[chainId];
  if (!src) return <Fallback letter={chainName(chainId).slice(0, 1)} className={cn("size-4", className)} />;
  return <Image src={src} width={32} height={32} alt="" className={cn("size-4 shrink-0", className)} />;
}

/** Amount with its token, as one unit: `250.00 ◉ USDC`. */
export function TokenAmount({
  amount,
  symbol,
  className,
  muted = false,
}: {
  amount: string;
  symbol: string;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular", className)}>
      <span className={cn("font-medium", muted && "font-normal text-muted-foreground")}>{amount}</span>
      <TokenMark symbol={symbol} className="size-3.5" />
      <span className="text-muted-foreground">{symbol}</span>
    </span>
  );
}

/** Chain mark and name. */
export function Chain({ chainId, className }: { chainId: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ChainMark chainId={chainId} />
      {chainName(chainId)}
    </span>
  );
}
