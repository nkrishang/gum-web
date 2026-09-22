"use client";

import { CopyButton } from "@/components/copy-button";
import { Hex } from "@/components/hex";
import { Chain, TokenAmount } from "@/components/marks";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Deposit } from "@/lib/gum/types";
import { explorerAddressUrl, formatDate, formatDateFull, formatUnits, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One row per deposit, read-only. Columns have fixed widths so the header and
 * every row line up whatever the values, and every header and cell is centred
 * in its column. Addresses and ids carry their copy controls.
 */

// The short columns have fixed widths; the two address columns share whatever
// is left, so the table is always exactly as wide as its container and the
// addresses get the room their controls need. Header and cells share one
// rule: everything is centred in its column.
const COLUMNS = [
  { key: "id", label: "ID", className: "w-[118px]" },
  { key: "amount", label: "Amount", className: "w-[148px]" },
  { key: "status", label: "Status", className: "w-[116px]" },
  { key: "chain", label: "Chain", className: "w-[104px]" },
  { key: "address", label: "Payment address", className: "" },
  { key: "receiver", label: "Receiver", className: "hidden xl:table-cell" },
  { key: "created", label: "Created", className: "w-[132px]" },
  { key: "expires", label: "Expires", className: "hidden w-[128px] md:table-cell" },
] as const;

const CELL = "h-[52px] px-2.5 text-center align-middle";

export function DepositsTable({ items, loading = false }: { items: Deposit[]; loading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* A floor on the width, raised as columns appear: below it the table
          scrolls sideways inside its frame rather than letting the fixed columns
          crush the address into nothing and pile the cells on top of each other. */}
      <Table className="min-w-[880px] table-fixed text-[13px] md:min-w-[940px]">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {COLUMNS.map((c) => (
              <TableHead
                key={c.key}
                className={cn("h-9 px-2.5 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase", c.className)}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {COLUMNS.map((c) => (
                    <TableCell key={c.key} className={cn(CELL, c.className)}>
                      <Skeleton className="mx-auto h-3.5 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : items.map((d) => {
                const open = d.status === "pending" || d.status === "partial_paid";
                const partial = d.confirmed_amount !== "0" && d.confirmed_amount !== d.amount;
                return (
                  <TableRow key={d.id}>
                    <TableCell className={CELL}>
                      <span className="inline-flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger render={<span className="font-mono text-[13px] tracking-tight" />}>
                            {d.id.slice(0, 8)}
                          </TooltipTrigger>
                          <TooltipContent className="font-mono text-xs">{d.id}</TooltipContent>
                        </Tooltip>
                        <CopyButton value={d.id} label="Copy id" className="size-6 text-muted-foreground" />
                      </span>
                    </TableCell>

                    {/* Amount and token; a partial payment notes its confirmed total. */}
                    <TableCell className={CELL}>
                      <div className="flex flex-col items-center gap-0.5 leading-tight">
                        <TokenAmount amount={formatUnits(d.amount, d.token_decimals)} symbol={d.token} />
                        {partial && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatUnits(d.confirmed_amount, d.token_decimals)} confirmed
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className={CELL}>
                      <StatusBadge status={d.status} />
                    </TableCell>

                    <TableCell className={CELL}>
                      <Chain chainId={d.chain_id} />
                    </TableCell>

                    <TableCell className={CELL}>
                      <Hex value={d.payment_address} href={explorerAddressUrl(d.chain_id, d.payment_address)} />
                    </TableCell>

                    <TableCell className={cn(CELL, "hidden xl:table-cell")}>
                      <Hex value={d.receiver} />
                    </TableCell>

                    <TableCell className={cn(CELL, "text-muted-foreground tabular")}>
                      <When iso={d.timestamps.created_at} />
                    </TableCell>

                    <TableCell className={cn(CELL, "hidden tabular md:table-cell", open ? "text-foreground" : "text-muted-foreground")}>
                      <When iso={d.expires_at} relative={open} />
                    </TableCell>
                  </TableRow>
                );
              })}
        </TableBody>
      </Table>
    </div>
  );
}

/** A timestamp, short in the cell and full on hover. */
function When({ iso, relative = false }: { iso: string; relative?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-block" />}>{relative ? relativeTime(iso) : formatDate(iso)}</TooltipTrigger>
      <TooltipContent>{formatDateFull(iso)}</TooltipContent>
    </Tooltip>
  );
}
