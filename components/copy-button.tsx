"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = React.useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), timeout);
        return true;
      } catch {
        // Clipboard access can be blocked; the value stays visible to select by hand.
        return false;
      }
    },
    [timeout],
  );
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { copied, copy };
}

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "icon-sm",
  variant = "ghost",
  children,
}: {
  value: string;
  label?: string;
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  children?: React.ReactNode;
}) {
  const { copied, copy } = useCopy();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={label}
            className={cn("shrink-0", className)}
            onClick={(e) => {
              e.stopPropagation();
              void copy(value);
            }}
          />
        }
      >
        {copied ? <CheckIcon className="text-status-settled" /> : <CopyIcon />}
        {children}
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}
