"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDownIcon, FlaskConicalIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react";
import { NETWORKS } from "@/lib/pay/networks";
import { SCENARIOS, Simulator, simSetupFrom, type ScenarioId, type WalletBehavior } from "@/lib/pay/simulator";
import { cn } from "@/lib/utils";
import type { ReturnTo } from "./outcomes";
import { PayWidgetView } from "./widget";

/**
 * /pay/test: the real widget over a simulated deposit and a simulated wallet, with a panel to
 * put it in any state. `?scenario=&network=&token=&amount=` pick the starting point, so a state can
 * be linked to.
 */
export function TestPay({
  params,
  returnTo,
  theme,
}: {
  params: Record<string, string | string[] | undefined>;
  returnTo: ReturnTo | null;
  theme: "light" | "dark";
}) {
  const setup = React.useMemo(() => simSetupFrom(params), [params]);
  const key = `${setup.network.slug}:${setup.token}:${setup.amount}`;
  return <TestPayInner key={key} setup={setup} returnTo={returnTo} theme={theme} />;
}

function TestPayInner({
  setup,
  returnTo,
  theme,
}: {
  setup: ReturnType<typeof simSetupFrom>;
  returnTo: ReturnTo | null;
  theme: "light" | "dark";
}) {
  const [sim] = React.useState(() => new Simulator(setup));
  return (
    <>
      <PayWidgetView feed={sim} simulator={sim} returnTo={returnTo} theme={theme} />
      <TestPanel sim={sim} />
    </>
  );
}

const WALLET_BEHAVIORS: { id: WalletBehavior; label: string }[] = [
  { id: "ok", label: "Pays normally" },
  { id: "reject", label: "User declines" },
  { id: "wrong_chain", label: "Starts on Ethereum" },
  { id: "insufficient", label: "Not enough balance" },
  { id: "no_gas", label: "No gas" },
  { id: "revert", label: "Transfer reverts" },
];

function TestPanel({ sim }: { sim: Simulator }) {
  const controls = React.useSyncExternalStore(sim.subscribeControls, sim.getControls, sim.getControls);
  const snapshot = React.useSyncExternalStore(sim.subscribe, sim.getSnapshot, sim.getSnapshot);
  const router = useRouter();
  const pathname = usePathname();
  // Unset until toggled: open on wide screens, folded on phones, where it would cover the card.
  const [open, setOpen] = React.useState<boolean | null>(null);
  const status = snapshot.deposit?.status ?? (snapshot.notFound ? "not found" : "…");
  const open_ = status === "pending" || status === "partial_paid";
  const paid = status === "paid";

  function navigate(patch: Record<string, string>) {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) params.set(k, v);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function load(id: ScenarioId) {
    sim.load(id);
    const params = new URLSearchParams(window.location.search);
    params.set("scenario", id);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  return (
    <aside
      className={cn(
        "gum-pay fixed right-3 bottom-3 left-3 z-40 rounded-2xl border border-(--pay-line) bg-(--pay-card) text-[12.5px] shadow-[0_12px_40px_-8px_rgb(0_0_0/0.25)] sm:left-auto sm:w-[330px]",
      )}
      aria-label="Test mode controls"
    >
      <button
        type="button"
        onClick={() => setOpen(!(open ?? window.matchMedia("(min-width: 640px)").matches))}
        aria-expanded={open ?? undefined}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-(--pay-brand) text-[#121212]">
          <FlaskConicalIcon className="size-3.5" />
        </span>
        <span className="flex-1 font-semibold">Test mode</span>
        <span className="rounded-full bg-(--pay-soft) px-2 py-0.5 font-mono text-[11px]">{status}</span>
        {controls.queued > 0 ? (
          <span className="font-mono text-[11px] text-(--pay-muted)" title="Steps scheduled by the autopilot">
            +{controls.queued}
          </span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-4 text-(--pay-muted) transition-transform",
            open === false && "rotate-180",
            open === null && "max-sm:rotate-180",
          )}
        />
      </button>

      {open !== false ? (
        <div
          className={cn(
            "max-h-[62dvh] space-y-4 overflow-y-auto border-t border-(--pay-line) px-4 pt-3 pb-4",
            open === null && "max-sm:hidden",
          )}
        >
          <Field label="Scenario">
            <select
              value={controls.scenario}
              onChange={(e) => load(e.target.value as ScenarioId)}
              className="h-9 w-full rounded-lg border border-(--pay-line) bg-(--pay-card) px-2.5"
            >
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 leading-snug text-(--pay-muted)">{SCENARIOS.find((s) => s.id === controls.scenario)?.hint}</p>
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Network">
              <select
                value={sim.setup.network.slug}
                onChange={(e) => {
                  const network = Object.values(NETWORKS).find((n) => n.slug === e.target.value)!;
                  const token = network.tokens.some((t) => t.symbol === sim.setup.token) ? sim.setup.token : network.tokens[0].symbol;
                  navigate({ network: network.slug, token });
                }}
                className="h-9 w-full rounded-lg border border-(--pay-line) bg-(--pay-card) px-2"
              >
                {Object.values(NETWORKS).map((n) => (
                  <option key={n.slug} value={n.slug}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Token">
              <select
                value={sim.setup.token}
                onChange={(e) => navigate({ token: e.target.value })}
                className="h-9 w-full rounded-lg border border-(--pay-line) bg-(--pay-card) px-2"
              >
                {sim.setup.network.tokens.map((t) => (
                  <option key={t.symbol} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount">
              <select
                value={sim.setup.amount}
                onChange={(e) => navigate({ amount: e.target.value })}
                className="h-9 w-full rounded-lg border border-(--pay-line) bg-(--pay-card) px-2"
              >
                {Array.from(new Set(["0.5", "25", "250", "1999.99", "125000", sim.setup.amount])).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Simulated wallet">
            <select
              value={controls.walletBehavior}
              onChange={(e) => sim.setControls({ walletBehavior: e.target.value as WalletBehavior })}
              className="h-9 w-full rounded-lg border border-(--pay-line) bg-(--pay-card) px-2.5"
            >
              {WALLET_BEHAVIORS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-2">
            <Toggle
              label="Autopilot"
              hint="Detect, confirm and settle on the chain's rhythm"
              checked={controls.autopilot}
              onChange={(v) => sim.setControls({ autopilot: v })}
            />
            <Toggle
              label="Drop the connection"
              hint="Updates queue up and land on reconnect"
              checked={controls.offline}
              onChange={(v) => sim.setControls({ offline: v })}
            />
          </div>

          <Field label="Events">
            <div className="grid grid-cols-2 gap-1.5">
              <Action onClick={() => sim.step()} disabled={!open_ && !paid} primary>
                <SkipForwardIcon className="size-3.5" /> Next event
              </Action>
              <Action onClick={() => load(controls.scenario)}>
                <RotateCcwIcon className="size-3.5" /> Restart
              </Action>
              <Action onClick={() => sim.sendExternal("full")} disabled={!open_}>
                Transfer: rest
              </Action>
              <Action onClick={() => sim.sendExternal("part")} disabled={!open_}>
                Transfer: half
              </Action>
              <Action onClick={() => sim.confirm()} disabled={!open_}>
                Confirm
              </Action>
              <Action onClick={() => sim.orphan()} disabled={!open_}>
                Reorg it out
              </Action>
              <Action onClick={() => sim.settle()} disabled={!paid}>
                Settle
              </Action>
              <Action onClick={() => sim.fail()} disabled={!paid}>
                Fail settlement
              </Action>
              <Action onClick={() => sim.expire()} disabled={!open_}>
                Expire now
              </Action>
            </div>
          </Field>
        </div>
      ) : null}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium tracking-wide text-(--pay-muted) uppercase">{label}</p>
      {children}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-[11.5px] text-(--pay-muted)">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full bg-(--pay-sunk) transition-colors peer-checked:bg-(--pay-ink) peer-focus-visible:outline-2 peer-focus-visible:outline-(--pay-brand) after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}

function Action({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        primary
          ? "border-transparent bg-(--pay-button) text-(--pay-button-ink) hover:opacity-90"
          : "border-(--pay-line) bg-(--pay-card) hover:bg-(--pay-soft)",
      )}
    >
      {children}
    </button>
  );
}
