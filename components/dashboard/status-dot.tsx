import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted-foreground/40",
  success: "bg-status-settled",
  warning: "bg-status-partial",
} as const;

/** A small state marker at the start of a row. */
export function StatusDot({ tone, className }: { tone: keyof typeof tones; className?: string }) {
  return <span className={cn("inline-flex size-2 shrink-0 rounded-full", tones[tone], className)} />;
}
