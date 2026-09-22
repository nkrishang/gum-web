"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InboxIcon, RefreshCwIcon } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { SectionHeader } from "@/components/dashboard/shell";
import { DepositFilterBar } from "@/components/dashboard/deposits/filter-bar";
import { DepositsTable } from "@/components/dashboard/deposits/deposits-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { describeError, useAccount, useDeposits } from "@/lib/gum/hooks";
import type { DepositFilters, DepositStatus } from "@/lib/gum/types";
import { DEPOSIT_STATUSES } from "@/lib/gum/types";
import { publicApiUrl } from "@/lib/env";

const FILTER_KEYS = ["status", "chain_id", "token", "reference", "payment_address", "receiver", "created_after", "created_before"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

function parseFilters(params: URLSearchParams): DepositFilters {
  const f: DepositFilters = { limit: 50 };
  const status = params.get("status");
  if (status && (DEPOSIT_STATUSES as string[]).includes(status)) f.status = status as DepositStatus;
  for (const key of FILTER_KEYS) {
    if (key === "status") continue;
    const v = params.get(key)?.trim();
    if (v) f[key] = v;
  }
  return f;
}

export function DepositsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = React.useMemo(() => parseFilters(params), [params]);
  const hasFilters = FILTER_KEYS.some((k) => params.has(k));

  const setFilters = React.useCallback(
    (patch: Partial<Record<FilterKey, string | undefined>>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const clear = React.useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const deposits = useDeposits(filters);
  const account = useAccount();
  const items = React.useMemo(() => deposits.data?.pages.flatMap((p) => p.items) ?? [], [deposits.data]);

  return (
    <section aria-label="Deposits">
      <SectionHeader
        level="h1"
        title="Deposits."
        description="Explore deposit requests created by your API keys. New deposit requests are created through the API."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void deposits.refetch()}
            disabled={deposits.isFetching}
          >
            <RefreshCwIcon data-icon="inline-start" className={deposits.isFetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
        }
      />

      <DepositFilterBar filters={filters} onChange={setFilters} onClear={clear} hasFilters={hasFilters} />

      {/* Room under the filter row for a validation message. */}
      <div className="mt-5">
        {deposits.isPending ? (
          <DepositsTable items={[]} loading />
        ) : deposits.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load deposits</AlertTitle>
            <AlertDescription>{describeError(deposits.error)}</AlertDescription>
          </Alert>
        ) : items.length === 0 ? (
          hasFilters ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>No deposits match</EmptyTitle>
                <EmptyDescription>Try widening the filters.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <FirstDeposit hasKey={Boolean(account.data?.api_key)} />
          )
        ) : (
          <>
            <DepositsTable items={items} />
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span className="tabular">
                {items.length} deposit{items.length === 1 ? "" : "s"}
                {deposits.hasNextPage ? " loaded" : ""}
              </span>
              {deposits.hasNextPage && (
                <Button variant="outline" size="sm" onClick={() => void deposits.fetchNextPage()} disabled={deposits.isFetchingNextPage}>
                  {deposits.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                  Load more
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function FirstDeposit({ hasKey }: { hasKey: boolean }) {
  // Computed once on mount so the snippet does not change on every render.
  const [expiresAt] = React.useState(() =>
    new Date(Date.now() + 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
  );
  const snippet = `curl -X POST ${publicApiUrl}/v1/deposit \\
  -H "Authorization: Bearer gum_sk_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: first-deposit" \\
  -d '{ "chain": "base", "token": "USDC", "amount": "1000000",
        "receiver": "0xYourAddress…", "expires_at": "${expiresAt}" }'`;
  return (
    <div className="grid gap-6 rounded-xl border border-border bg-card p-6 lg:grid-cols-[1fr_1.2fr] lg:items-center">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">No deposits yet</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {hasKey
            ? "Create your first one-time address from your backend. It will show up here within seconds."
            : "Create an API key first, then request your first one-time address from your backend."}
        </p>
        <div className="mt-4 flex gap-2">
          {!hasKey && (
            <Button variant="brand" size="sm" render={<a href="#api-key" />}>
              Create API key
            </Button>
          )}
          <Button variant="outline" size="sm" render={<a href="#webhooks" />}>
            Set up webhooks
          </Button>
        </div>
      </div>
      <CodeBlock title="POST /v1/deposit" code={snippet} lang="bash" className="min-w-0" />
    </div>
  );
}
