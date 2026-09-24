import { parseTime } from "./time";
import type { PayDeposit } from "./types";

/**
 * A deposit, kept current. The widget reads everything through this interface, so the same UI
 * runs against the live API (`LiveFeed`) and against the test-mode simulator (`Simulator`).
 */

export type FeedConnection = "connecting" | "live" | "reconnecting" | "closed";

export interface FeedSnapshot {
  deposit: PayDeposit | null;
  notFound: boolean;
  connection: FeedConnection;
  /** server clock − client clock, ms. Add it to `Date.now()` to read the server's clock. */
  clockOffset: number;
}

export interface DepositFeed {
  subscribe(listener: () => void): () => void;
  getSnapshot(): FeedSnapshot;
  start(): void;
  stop(): void;
}

export class FeedStore {
  protected snapshot: FeedSnapshot;
  private listeners = new Set<() => void>();

  constructor(initial: PayDeposit | null) {
    this.snapshot = {
      deposit: initial,
      notFound: false,
      connection: initial ? "live" : "connecting",
      clockOffset: initial ? offsetFrom(initial, Date.now()) : 0,
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  protected set(patch: Partial<FeedSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const l of this.listeners) l();
  }

  /** Take a fresh deposit. Returns whether anything changed. */
  protected accept(next: PayDeposit, clockOffset?: number): boolean {
    const prev = this.snapshot.deposit;
    const changed = !prev || prev.sequence !== next.sequence || prev.status !== next.status;
    this.set({ deposit: next, notFound: false, ...(clockOffset !== undefined ? { clockOffset } : {}) });
    return changed;
  }
}

/** server_time − the client's clock when the response arrived. Good to a one-way trip. */
function offsetFrom(deposit: PayDeposit, receivedAt: number): number {
  const server = parseTime(deposit.server_time);
  return server === null ? 0 : server - receivedAt;
}

const WAIT_SECS = 25;
const MIN_INTERVAL_MS = 1_000;
const MAX_BACKOFF_MS = 10_000;
const REQUEST_TIMEOUT_MS = (WAIT_SECS + 10) * 1_000;

/**
 * Long-polls `GET /v1/pay/{id}?after=<sequence>&wait=25` (through the same-origin proxy). The
 * server holds the request until the deposit's sequence moves, so a state change reaches the page
 * one network trip after it commits, without hammering anything in between. If a server answers
 * immediately without a change (no long-poll support), the loop falls back to one request a second.
 */
export class LiveFeed extends FeedStore implements DepositFeed {
  private running = false;
  /** Each start() runs its own loop; a stale one (StrictMode's stop-start) sees the bump and ends. */
  private generation = 0;
  private controller: AbortController | null = null;
  private wake: (() => void) | null = null;
  /** Best one-way estimate, from the fastest immediate answer seen. */
  private oneWayMs = 0;

  constructor(
    private id: string,
    initial: PayDeposit | null,
    private base = "/api/pay",
  ) {
    super(initial);
  }

  start() {
    if (this.running) return;
    this.running = true;
    window.addEventListener("online", this.retryNow);
    document.addEventListener("visibilitychange", this.onVisible);
    void this.loop(++this.generation);
  }

  stop() {
    this.running = false;
    this.generation++;
    this.controller?.abort();
    window.removeEventListener("online", this.retryNow);
    document.removeEventListener("visibilitychange", this.onVisible);
  }

  /** A laptop waking from sleep can hold a dead request; start a fresh one. */
  private onVisible = () => {
    if (document.visibilityState === "visible" && this.snapshot.connection !== "closed") this.retryNow();
  };

  private retryNow = () => {
    this.controller?.abort();
    this.wake?.();
  };

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        resolve();
      }
      this.wake = done;
    });
  }

  private async loop(generation: number) {
    let backoff = 0;
    let failures = 0;
    const live = () => this.running && this.generation === generation;
    while (live()) {
      const current = this.snapshot.deposit;
      const params = new URLSearchParams();
      if (current) {
        params.set("after", String(current.sequence));
        params.set("wait", String(WAIT_SECS));
      }
      const qs = params.toString();
      const controller = new AbortController();
      this.controller = controller;
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const startedAt = Date.now();
      const t0 = performance.now();

      try {
        const res = await fetch(`${this.base}/${encodeURIComponent(this.id)}${qs ? `?${qs}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const elapsed = performance.now() - t0;
        if (!live()) return;
        if (res.status === 404) {
          this.set({ notFound: true, connection: "closed" });
          this.running = false;
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as PayDeposit;
        if (!live()) return;
        const receivedAt = Date.now();
        if (!current) this.oneWayMs = elapsed / 2;
        else if (elapsed < 2 * this.oneWayMs || this.oneWayMs === 0) this.oneWayMs = elapsed / 2;
        const server = parseTime(next.server_time);
        const offset = server === null ? undefined : server - (receivedAt - this.oneWayMs);
        const changed = this.accept(next, offset);
        if (this.snapshot.connection !== "live") this.set({ connection: "live" });
        backoff = 0;
        failures = 0;

        if (isTerminal(next.status)) {
          this.set({ connection: "closed" });
          this.running = false;
          return;
        }
        // A server without long-poll answers at once; do not spin.
        const since = Date.now() - startedAt;
        if (!changed && since < MIN_INTERVAL_MS) await this.sleep(MIN_INTERVAL_MS - since);
      } catch {
        if (!live()) return;
        const aborted = controller.signal.aborted;
        failures += 1;
        // One aborted request is a deliberate retry (tab woke up, came back online), not trouble.
        if (!aborted || failures > 1) this.set({ connection: "reconnecting" });
        backoff = Math.min(MAX_BACKOFF_MS, backoff ? backoff * 2 : 500);
        await this.sleep(aborted && failures === 1 ? 0 : backoff);
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

export function isTerminal(status: PayDeposit["status"]): boolean {
  return status === "settled" || status === "failed" || status === "expired";
}
