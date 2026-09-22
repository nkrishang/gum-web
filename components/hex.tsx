"use client";

import { ExternalLinkIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortHex } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A 0x value: truncated, monospace, copyable, optionally linked to an explorer. */
export function Hex({
  value,
  href,
  full = false,
  lead = 6,
  tail = 4,
  className,
  copy = true,
}: {
  value: string;
  href?: string | null;
  full?: boolean;
  lead?: number;
  tail?: number;
  className?: string;
  copy?: boolean;
}) {
  const text = full ? value : shortHex(value, lead, tail);
  const inner = (
    <span className={cn("font-mono text-[13px] tracking-tight break-all", className)}>{text}</span>
  );
  return (
    <span className="inline-flex max-w-full items-center gap-0.5">
      {full ? (
        inner
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>{inner}</TooltipTrigger>
          <TooltipContent className="font-mono text-xs">{value}</TooltipContent>
        </Tooltip>
      )}
      {copy && <CopyButton value={value} className="size-6 text-muted-foreground" />}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Open in explorer"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      )}
    </span>
  );
}
