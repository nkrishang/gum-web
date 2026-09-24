import { FeedStore, type DepositFeed } from "./feed";
import { NETWORKS, networkBySlug, type PayNetwork } from "./networks";
import type { PayDeposit, PayEvent, PayEventData, PayTransfer } from "./types";

/**
 * Test mode. A deposit that lives in the browser and moves through exactly the events gum-server
 * records (deposit.detected → payment_confirmed → ready → settlement_submitted → included →
 * settled, plus orphaned / failed / expired), so every state of the page can be seen and poked at
 * without a real deposit or real money. It is a `DepositFeed`, so the widget cannot tell.
 *
 * With autopilot on, a payment sent from the simulated wallet (or an "external transfer" from the
 * panel) is detected, confirmed and settled on the chain's own rhythm. With it off, every step
 * waits for a button.
 */

export type WalletBehavior = "ok" | "reject" | "insufficient" | "no_gas" | "wrong_chain" | "missing_chain" | "revert";

export interface SimControls {
  scenario: ScenarioId;
  autopilot: boolean;
  walletBehavior: WalletBehavior;
  /** Simulated connection trouble: updates queue up and land when it is back. */
  offline: boolean;
  /** Steps waiting on the autopilot's timers, for the panel. */
  queued: number;
}

export type ScenarioId =
  | "fresh"
  | "external"
  | "partial"
  | "reorg"
  | "failed"
  | "expiring"
  | "expired"
  | "expired_partial"
  | "settled"
  | "not_found";

export const SCENARIOS: { id: ScenarioId; label: string; hint: string }[] = [
  { id: "fresh", label: "Awaiting payment", hint: "A new request. Pay it with the simulated wallet, or send an external transfer." },
  { id: "external", label: "Paid by QR, full lifecycle", hint: "Someone scans the code three seconds in. Watch it detect, confirm and settle." },
  { id: "partial", label: "Underpaid", hint: "40% arrives and confirms. The page asks for the rest." },
  { id: "reorg", label: "Reorged transfer", hint: "A transfer is seen at head, then reorged out before it confirms." },
  { id: "failed", label: "Settlement fails", hint: "Paid in full, then settlement fails. The payer is told they are done." },
  { id: "expiring", label: "Expiring in 40s", hint: "The clock turns urgent, then the request closes." },
  { id: "expired", label: "Expired, unpaid", hint: "Closed before anything arrived." },
  { id: "expired_partial", label: "Expired, part paid", hint: "Closed after a partial payment." },
  { id: "settled", label: "Already settled", hint: "Opened after the fact: the receipt." },
  { id: "not_found", label: "Unknown link", hint: "An id the API does not know." },
];

export interface SimSetup {
  scenario: ScenarioId;
  network: PayNetwork;
  token: string;
  /** Whole units, e.g. "250". */
  amount: string;
}

export function simSetupFrom(params: Record<string, string | string[] | undefined>): SimSetup {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const scenario = (SCENARIOS.find((s) => s.id === one("scenario"))?.id ?? "fresh") as ScenarioId;
  const network = networkBySlug(one("network") ?? "base") ?? NETWORKS[8453];
  const wanted = (one("token") ?? "USDC").toUpperCase();
  const token = network.tokens.find((t) => t.symbol === wanted)?.symbol ?? network.tokens[0].symbol;
  const rawAmount = one("amount") ?? "250";
  const amount = /^\d{1,9}(\.\d{1,6})?$/.test(rawAmount) ? rawAmount : "250";
  return { scenario, network, token, amount };
}

const hex = (bytes: number) => {
  let out = "0x";
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  for (const b of buf) out += b.toString(16).padStart(2, "0");
  return out;
};

function toBase(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export const SIM_PAYER = "0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c";
const EXTERNAL_PAYER = "0x71c7656ec7ab88b098defb751b7401b5f6d8976f";

export class Simulator extends FeedStore implements DepositFeed {
  readonly setup: SimSetup;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private controlListeners = new Set<() => void>();
  private controls: SimControls;
  private block = 31_204_117;
  /** Changes made while "offline", delivered when the connection returns. */
  private pending: PayDeposit | null = null;
  private started = false;

  constructor(setup: SimSetup) {
    super(null);
    this.setup = setup;
    this.controls = { scenario: setup.scenario, autopilot: true, walletBehavior: "ok", offline: false, queued: 0 };
  }

  // ---- controls store (the panel) --------------------------------------------------------

  subscribeControls = (listener: () => void) => {
    this.controlListeners.add(listener);
    return () => {
      this.controlListeners.delete(listener);
    };
  };

  getControls = () => this.controls;

  setControls(patch: Partial<SimControls>) {
    const wasOffline = this.controls.offline;
    this.controls = { ...this.controls, ...patch };
    for (const l of this.controlListeners) l();
    if (wasOffline && !this.controls.offline) {
      this.set({ connection: "live" });
      if (this.pending) {
        const next = this.pending;
        this.pending = null;
        this.accept(next, 0);
      }
    } else if (!wasOffline && this.controls.offline) {
      this.set({ connection: "reconnecting" });
    }
  }

  // ---- DepositFeed ----------------------------------------------------------------------------

  start() {
    if (this.started) return;
    this.started = true;
    this.load(this.controls.scenario);
  }

  stop() {
    this.started = false;
    this.clearTimers();
  }

  // ---- scenarios ------------------------------------------------------------------------------

  get network(): PayNetwork {
    return this.setup.network;
  }

  private get token() {
    return this.setup.network.tokens.find((t) => t.symbol === this.setup.token) ?? this.setup.network.tokens[0];
  }

  private get deposit(): PayDeposit | null {
    return this.pending ?? this.snapshot.deposit;
  }

  load(scenario: ScenarioId) {
    this.clearTimers();
    this.pending = null;
    this.setControls({ scenario, offline: false, queued: 0 });
    this.set({ notFound: false, connection: "live", clockOffset: 0 });

    if (scenario === "not_found") {
      this.set({ deposit: null, notFound: true, connection: "closed" });
      return;
    }

    const now = Date.now();
    const amount = toBase(this.setup.amount, this.token.decimals);
    const lifetime = scenario === "expiring" ? 40_000 : 30 * 60_000;
    const createdAt = scenario === "expired" || scenario === "expired_partial" || scenario === "settled" ? now - 32 * 60_000 : now - 4_000;
    const expiresAt = scenario === "expired" || scenario === "expired_partial" ? now - 60_000 : createdAt + lifetime + 4_000;

    const base: PayDeposit = {
      id: "test",
      status: "pending",
      sequence: 0,
      payment_address: "0x9a3f5c1e8d7b24a6f0e3c9d2b8a17e4f6c05a0c2",
      chain_id: this.network.chain.id,
      token: this.token.symbol,
      token_address: this.token.address.toLowerCase(),
      token_decimals: this.token.decimals,
      amount: amount.toString(),
      confirmed_amount: "0",
      expires_at: new Date(expiresAt).toISOString(),
      timestamps: {
        created_at: new Date(createdAt).toISOString(),
        updated_at: new Date(createdAt).toISOString(),
        detected_at: null,
        settled_at: null,
        failed_at: null,
        expired_at: null,
      },
      server_time: new Date(now).toISOString(),
      events: [],
    };
    this.set({ deposit: base });
    this.record("deposit.created", {}, createdAt);

    const b = this.network.blockTimeMs;
    switch (scenario) {
      case "external":
        this.after(3_000, () => this.detect(amount, EXTERNAL_PAYER));
        break;
      case "partial": {
        const part = (amount * 40n) / 100n;
        this.detect(part, EXTERNAL_PAYER, createdAt + 60_000, true);
        this.confirmAll(createdAt + 60_000 + b * 2, true);
        break;
      }
      case "reorg":
        this.after(1_500, () => this.detect(amount, EXTERNAL_PAYER, undefined, false, { autoConfirm: false }));
        this.after(1_500 + Math.max(1_600, b * 3), () => this.orphan());
        break;
      case "failed":
        this.after(1_200, () => this.detect(amount, EXTERNAL_PAYER, undefined, false, { autoConfirm: true, fail: "execution_reverted" }));
        break;
      case "expiring":
        this.after(lifetime + 4_500, () => this.expire());
        break;
      case "expired":
        this.record("deposit.expired", {}, expiresAt + 400);
        this.patch({ status: "expired", timestamps: { ...this.deposit!.timestamps, expired_at: new Date(expiresAt + 400).toISOString() } });
        break;
      case "expired_partial": {
        const part = (amount * 25n) / 100n;
        this.detect(part, EXTERNAL_PAYER, createdAt + 90_000, true);
        this.confirmAll(createdAt + 90_000 + b * 2, true);
        this.record("deposit.expired", {}, expiresAt + 400);
        this.patch({ status: "expired", timestamps: { ...this.deposit!.timestamps, expired_at: new Date(expiresAt + 400).toISOString() } });
        break;
      }
      case "settled": {
        const t = createdAt + 5 * 60_000;
        this.detect(amount, SIM_PAYER, t, true);
        // Reaching the amount records deposit.ready itself.
        this.confirmAll(t + b * 2, true);
        this.submit(t + b * 2 + 140);
        this.include(t + b * 3 + 300);
        this.settle(t + b * 4 + 420);
        break;
      }
    }
  }

  // ---- lifecycle steps (also the panel's buttons) ------------------------------------------

  /** A transfer seen at chain head. Returns its hash. */
  detect(
    amount: bigint,
    from = EXTERNAL_PAYER,
    at?: number,
    silent = false,
    opts: { autoConfirm?: boolean; fail?: string; txHash?: string } = {},
  ): string | null {
    const d = this.deposit;
    if (!d || (d.status !== "pending" && d.status !== "partial_paid")) return null;
    const transfer: PayTransfer = {
      tx_hash: opts.txHash ?? hex(32),
      log_index: Math.floor(Math.random() * 40),
      block_number: ++this.block,
      block_hash: hex(32),
      from,
      amount: amount.toString(),
      status: "pending",
    };
    const t = at ?? Date.now();
    this.patch({ status: "partial_paid", timestamps: { ...d.timestamps, detected_at: d.timestamps.detected_at ?? new Date(t).toISOString() } });
    this.record("deposit.detected", { transfer, confirmed_amount: d.confirmed_amount }, t);
    if ((opts.autoConfirm ?? this.controls.autopilot) && !silent) {
      const b = this.network.blockTimeMs;
      this.after(Math.max(600, b * 1.2) + jitter(200), () => {
        this.confirm(transfer.tx_hash);
        if (opts.fail) this.after(900, () => this.fail(opts.fail!));
      });
    }
    return transfer.tx_hash;
  }

  /** Confirms one pending transfer; reaching the amount makes it ready and starts settlement. */
  confirm(txHash?: string, at?: number, silent = false) {
    const d = this.deposit;
    if (!d || (d.status !== "pending" && d.status !== "partial_paid")) return;
    const pendingTransfers = this.openTransfers();
    const target = txHash ? pendingTransfers.find((p) => p.tx_hash === txHash) : pendingTransfers[0];
    if (!target) return;
    const t = at ?? Date.now();
    const confirmed = BigInt(d.confirmed_amount) + BigInt(target.amount);
    const transfer = { ...target, status: "confirmed" };
    const total = confirmed.toString();
    if (confirmed >= BigInt(d.amount)) {
      this.patch({ status: "paid", confirmed_amount: total });
      this.record("deposit.payment_confirmed", { transfer, confirmed_amount: total }, t);
      this.ready(t + 25);
      if (!silent && this.controls.autopilot && this.controls.scenario !== "failed") this.autoSettle();
      else if (!silent && this.controls.scenario === "failed") this.after(120, () => this.submit());
    } else {
      this.patch({ confirmed_amount: total });
      this.record("deposit.payment_confirmed", { transfer, confirmed_amount: total }, t);
    }
  }

  private confirmAll(at: number, silent: boolean) {
    for (const t of this.openTransfers()) this.confirm(t.tx_hash, at, silent);
  }

  orphan() {
    const d = this.deposit;
    if (!d) return;
    const target = this.openTransfers().at(-1);
    if (!target) return;
    this.record("deposit.payment_orphaned", { transfer: { ...target, status: "orphaned" }, confirmed_amount: d.confirmed_amount });
  }

  private ready(at?: number) {
    const d = this.deposit;
    if (!d) return;
    this.record("deposit.ready", { confirmed_amount: d.confirmed_amount }, at);
  }

  submit(at?: number) {
    if (this.deposit?.status !== "paid") return;
    if (this.deposit.events.some((e) => e.type === "deposit.settlement_submitted")) return;
    this.record("deposit.settlement_submitted", {}, at);
  }

  include(at?: number) {
    const d = this.deposit;
    if (d?.status !== "paid") return;
    const txHash = d.tx_hash ?? hex(32);
    const block = ++this.block;
    this.patch({ tx_hash: txHash, block_number: block });
    this.record("deposit.settlement_included", { tx_hash: txHash, block_number: block }, at);
  }

  settle(at?: number) {
    const d = this.deposit;
    if (d?.status !== "paid") return;
    const t = at ?? Date.now();
    const txHash = d.tx_hash ?? hex(32);
    const block = d.block_number ?? ++this.block;
    this.patch({ status: "settled", tx_hash: txHash, block_number: block, timestamps: { ...d.timestamps, settled_at: new Date(t).toISOString() } });
    this.record("deposit.settled", { tx_hash: txHash, block_number: block }, t);
  }

  fail(code = "execution_reverted") {
    const d = this.deposit;
    if (d?.status !== "paid") return;
    const t = Date.now();
    this.patch({ status: "failed", failure: { code }, timestamps: { ...d.timestamps, failed_at: new Date(t).toISOString() } });
    this.record("deposit.failed", { code }, t);
  }

  expire() {
    const d = this.deposit;
    if (!d || (d.status !== "pending" && d.status !== "partial_paid")) return;
    const t = Date.now();
    this.patch({ status: "expired", timestamps: { ...d.timestamps, expired_at: new Date(t).toISOString() } });
    this.record("deposit.expired", {}, t);
  }

  /** Whatever is next, one step at a time. For the panel's "Next event". */
  step() {
    const d = this.deposit;
    if (!d) return;
    const has = (type: string) => d.events.some((e) => e.type === type);
    if (d.status === "pending" || d.status === "partial_paid") {
      if (this.openTransfers().length) return this.confirm();
      const remaining = BigInt(d.amount) - BigInt(d.confirmed_amount);
      return void this.detect(remaining, EXTERNAL_PAYER, undefined, false, { autoConfirm: false });
    }
    if (d.status === "paid") {
      if (!has("deposit.settlement_submitted")) return this.submit();
      if (!has("deposit.settlement_included")) return this.include();
      return this.settle();
    }
  }

  /** The simulated wallet's transfer: the chain sees it, then (autopilot) the rest follows. */
  walletTransfer(amount: bigint, from: string): string {
    const txHash = hex(32);
    // Head detection on a real chain lands within a block of broadcast.
    const delay = Math.min(700, Math.max(250, this.network.blockTimeMs / 3)) + jitter(150);
    if (this.controls.autopilot) {
      this.after(delay, () => this.detect(amount, from, undefined, false, { txHash }));
    }
    return txHash;
  }

  sendExternal(fraction: "full" | "part") {
    const d = this.deposit;
    if (!d) return;
    const remaining = BigInt(d.amount) - BigInt(d.confirmed_amount) - this.openTransfers().reduce((s, t) => s + BigInt(t.amount), 0n);
    if (remaining <= 0n) return;
    const amount = fraction === "full" ? remaining : remaining / 2n || remaining;
    this.detect(amount, EXTERNAL_PAYER);
  }

  // ---- plumbing ---------------------------------------------------------------------------------

  private autoSettle() {
    const b = this.network.blockTimeMs;
    this.after(110 + jitter(40), () => this.submit());
    this.after(110 + Math.max(400, b * 0.6) + jitter(120), () => this.include());
    this.after(110 + Math.max(700, b * 0.8) + jitter(160), () => this.settle());
  }

  private openTransfers(): PayTransfer[] {
    const latest = new Map<string, PayTransfer>();
    for (const e of this.deposit?.events ?? []) {
      const t = e.data.transfer;
      if (t) latest.set(`${t.tx_hash}:${t.log_index}`, t);
    }
    return [...latest.values()].filter((t) => t.status === "pending");
  }

  private after(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.setControls({ queued: this.timers.size });
      fn();
    }, ms);
    this.timers.add(t);
    this.setControls({ queued: this.timers.size });
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private patch(patch: Partial<PayDeposit>) {
    const d = this.deposit;
    if (!d) return;
    this.commit({ ...d, ...patch, timestamps: { ...d.timestamps, ...patch.timestamps, updated_at: new Date().toISOString() } });
  }

  private record(type: string, data: PayEventData, at?: number) {
    const d = this.deposit;
    if (!d) return;
    const sequence = d.sequence + 1;
    const event: PayEvent = { id: crypto.randomUUID(), sequence, type, created_at: new Date(at ?? Date.now()).toISOString(), data };
    this.commit({ ...d, sequence, events: [...d.events, event] });
  }

  /** Publish a new deposit, as the long-poll would: now, or when the simulated network returns. */
  private commit(next: PayDeposit) {
    const stamped = { ...next, server_time: new Date().toISOString() };
    if (this.controls.offline) {
      this.pending = stamped;
      return;
    }
    this.accept(stamped, 0);
  }
}

function jitter(ms: number) {
  return Math.round(Math.random() * ms);
}
