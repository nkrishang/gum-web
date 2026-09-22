import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DepositStatus } from "@/lib/gum/types";
import { STATUS_HINT, STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

const DOT: Record<DepositStatus, string> = {
  pending: "bg-status-pending",
  partial_paid: "bg-status-partial",
  paid: "bg-status-paid",
  settled: "bg-status-settled",
  failed: "bg-status-failed",
  expired: "bg-status-expired",
};

const TEXT: Record<DepositStatus, string> = {
  pending: "text-foreground",
  partial_paid: "text-foreground",
  paid: "text-foreground",
  settled: "text-foreground",
  failed: "text-status-failed",
  expired: "text-muted-foreground",
};

export function StatusBadge({ status, className, hint = true }: { status: DepositStatus; className?: string; hint?: boolean }) {
  const badge = (
    <Badge variant="outline" className={cn("gap-1.5 bg-card pl-1.5 font-medium tabular", TEXT[status], className)}>
      <span className={cn("size-1.5 rounded-full", DOT[status], (status === "pending" || status === "paid") && "animate-pulse")} />
      {STATUS_LABEL[status]}
    </Badge>
  );
  if (!hint) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-64">{STATUS_HINT[status]}</TooltipContent>
    </Tooltip>
  );
}
