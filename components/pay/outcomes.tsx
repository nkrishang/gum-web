"use client";

import * as React from "react";
import { formatUnits } from "@/lib/format";
import type { PayModel } from "@/lib/pay/model";
import type { PayDeposit } from "@/lib/pay/types";
import { ReturnButton, StatusGlyph, type ReturnTo } from "./progress";

export type { ReturnTo } from "./progress";

/** A status that ends the page: a mark, a title, a line of copy, and a way back. Fills its frame. */
function Ending({
  tone,
  title,
  children,
  returnTo = null,
}: {
  tone: React.ComponentProps<typeof StatusGlyph>["tone"];
  title: string;
  children: React.ReactNode;
  returnTo?: ReturnTo | null;
}) {
  return (
    <div className="pay-rise flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <StatusGlyph tone={tone} />
        <h2 className="mt-4 text-[19px] font-semibold tracking-tight" aria-live="polite">
          {title}
        </h2>
        <div className="mt-1 max-w-[320px] text-[13.5px] leading-relaxed text-(--pay-muted)">{children}</div>
      </div>
      <ReturnButton returnTo={returnTo} />
    </div>
  );
}

export function ExpiredView({ deposit, model, returnTo }: { deposit: PayDeposit; model: PayModel; returnTo: ReturnTo | null }) {
  const from = returnTo ? returnTo.host : "the app that sent you here";
  return model.received > 0n ? (
    <Ending tone="muted" title="This request expired" returnTo={returnTo}>
      <span className="tabular text-(--pay-ink)">
        {formatUnits(model.received.toString(), deposit.token_decimals)} {deposit.token}
      </span>{" "}
      arrived before it closed. It&apos;s held safely and can be recovered. Contact {from}.
    </Ending>
  ) : (
    <Ending tone="muted" title="This request expired" returnTo={returnTo}>
      <strong className="font-medium text-(--pay-ink)">Don&apos;t send anything to its address.</strong> Start a new
      payment from {from}.
    </Ending>
  );
}

export function NotFoundView() {
  return (
    <Ending tone="muted" title="Payment not found">
      This link doesn&apos;t match a payment request. Check the link, or start again from the app that sent you here.
    </Ending>
  );
}
