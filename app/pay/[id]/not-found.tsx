import { NotFoundView } from "@/components/pay/outcomes";
import { PoweredByGum } from "@/components/pay/widget";

export default function PayNotFound() {
  return (
    <main className="gum-pay-page gum-pay flex min-h-dvh flex-col items-center bg-(--pay-bg) px-4 pt-6 sm:pt-16" data-theme="light">
      <div className="w-full max-w-[420px] overflow-hidden rounded-[22px] border border-(--pay-line) bg-(--pay-card) px-6 py-8">
        <NotFoundView />
      </div>
      <footer className="mt-5">
        <PoweredByGum />
      </footer>
    </main>
  );
}
