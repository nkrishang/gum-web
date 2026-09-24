import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PayWidget } from "@/components/pay/pay-widget";
import { TestPay } from "@/components/pay/test-mode";
import { PoweredByGum } from "@/components/pay/widget";
import { formatUnits } from "@/lib/format";
import { NETWORKS } from "@/lib/pay/networks";
import { loadPayDeposit, parseReturnTo } from "@/lib/pay/server";
import { cn } from "@/lib/utils";

/**
 * gum.money/pay/{id}: the hosted page for one deposit request. The deposit is fetched on the
 * server so the amount, network and address are in the first paint; the widget then keeps it live
 * from the browser. `/pay/test` is test mode: the same widget over a simulated deposit.
 *
 * Query: `return_url` (a "Back to <host>" button once it's done), `theme=dark`, `embed=1` (no page
 * chrome, for an iframe).
 */

export async function generateMetadata(props: PageProps<"/pay/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  if (id === "test") return { title: "Pay (test mode)" };
  const result = await loadPayDeposit(id);
  if (result.kind !== "found") return { title: "Pay" };
  const d = result.deposit;
  const chain = NETWORKS[d.chain_id]?.name ?? `chain ${d.chain_id}`;
  const title = `Pay ${formatUnits(d.amount, d.token_decimals)} ${d.token} on ${chain}`;
  return { title, openGraph: { title }, twitter: { title } };
}

export default async function PayPage(props: PageProps<"/pay/[id]">) {
  const { id } = await props.params;
  const search = await props.searchParams;
  const returnTo = parseReturnTo(search.return_url);
  const theme = search.theme === "dark" ? "dark" : "light";
  const embed = search.embed === "1";

  let widget: React.ReactNode;
  if (id === "test") {
    widget = <TestPay params={search} returnTo={returnTo} theme={theme} />;
  } else {
    const result = await loadPayDeposit(id);
    if (result.kind === "not_found") notFound();
    widget = (
      <PayWidget
        depositId={id}
        initial={result.kind === "found" ? result.deposit : null}
        returnTo={returnTo}
        theme={theme}
        variant={embed ? "embed" : "page"}
      />
    );
  }

  if (embed) {
    return <main className="gum-pay-page gum-pay min-h-dvh" data-theme={theme}>{widget}</main>;
  }
  return (
    <main
      className={cn(
        "gum-pay-page gum-pay flex min-h-dvh flex-col items-center bg-(--pay-bg) px-4 pt-6 pb-40 sm:pt-16",
      )}
      data-theme={theme}
    >
      <div className="w-full max-w-[420px]">{widget}</div>
      <footer className="mt-5">
        <PoweredByGum />
      </footer>
    </main>
  );
}
