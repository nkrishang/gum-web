"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { LiveFeed } from "@/lib/pay/feed";
import type { PayDeposit } from "@/lib/pay/types";
import { payWagmiConfig } from "@/lib/pay/wagmi";
import { PayWidgetView, type PayWidgetViewProps } from "./widget";

/**
 * The pay widget, live: a deposit request by id, kept current by long-polling the public payer
 * view, payable from a connected wallet, a QR code or the address.
 *
 * Self-contained on purpose: it brings its own wallet stack and query client and reads nothing
 * from the page around it, so the hosted page (gum.money/pay/{id}) and an app embedding the widget
 * run exactly the same thing. `initial` (fetched on the server) makes the first paint complete;
 * without it the widget loads on its own.
 */
export function PayWidget({
  depositId,
  initial = null,
  apiBase = "/api/pay",
  ...view
}: {
  depositId: string;
  initial?: PayDeposit | null;
  /** Where `GET {apiBase}/{id}` reaches gum-server's `/v1/pay/{id}`. */
  apiBase?: string;
} & Omit<PayWidgetViewProps, "feed" | "simulator">) {
  const [feed] = React.useState(() => new LiveFeed(depositId, initial, apiBase));
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );

  return (
    <WagmiProvider config={payWagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <PayWidgetView feed={feed} {...view} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
