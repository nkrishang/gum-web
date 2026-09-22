import type { Metadata } from "next";
import { Suspense } from "react";
import { ApiKeyView } from "@/components/dashboard/api-key-view";
import { DepositsView } from "@/components/dashboard/deposits/deposits-view";
import { SectionSkeleton } from "@/components/dashboard/shell";
import { WebhooksView } from "@/components/dashboard/webhooks-view";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The dashboard, on one page. Gum is API-first: deposits are created through
 * the API, and this is the account's control panel for the three things
 * there is nothing else to do through the API: the key that calls it, the
 * webhook it calls back, and the deposits themselves, read-only and filterable.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-14">
      <ApiKeyView />
      <WebhooksView />
      <Suspense fallback={<SectionSkeleton height={320} />}>
        <DepositsView />
      </Suspense>
    </div>
  );
}
