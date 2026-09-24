/**
 * The payer view of a deposit: `GET /v1/pay/{id}` on gum-server. Public, keyed by the deposit's
 * id, and stripped of everything that is the app's business (receiver, salt, recovery, reference,
 * webhook). Amounts are base-unit integer strings; timestamps are RFC 3339 with milliseconds.
 */

import type { DepositStatus } from "@/lib/gum/types";

export type PayStatus = DepositStatus;

/** A transfer to the payment address, as gum-indexer reported it. */
export interface PayTransfer {
  tx_hash: string;
  log_index: number;
  block_number: number;
  block_hash?: string;
  from: string;
  amount: string;
  /** "pending" (seen at chain head), "confirmed", or "orphaned" (reorged out). */
  status: string;
}

/** The payer-safe projection of an event's data. Every key is optional. */
export interface PayEventData {
  transfer?: PayTransfer;
  confirmed_amount?: string;
  tx_hash?: string;
  block_number?: number;
  code?: string;
}

export type PayEventType =
  | "deposit.created"
  | "deposit.detected"
  | "deposit.payment_confirmed"
  | "deposit.payment_orphaned"
  | "deposit.ready"
  | "deposit.settlement_submitted"
  | "deposit.settlement_included"
  | "deposit.settled"
  | "deposit.failed"
  | "deposit.expired";

export interface PayEvent {
  id: string;
  sequence: number;
  type: PayEventType | (string & {});
  created_at: string;
  data: PayEventData;
}

export interface PayDeposit {
  id: string;
  status: PayStatus;
  /** Moves on every state change. The long-poll waits for it to pass the one the client has. */
  sequence: number;
  payment_address: string;
  chain_id: number;
  token: string;
  token_address: string;
  token_decimals: number;
  amount: string;
  confirmed_amount: string;
  expires_at: string;
  /** The settlement transaction. */
  tx_hash?: string;
  block_number?: number;
  failure?: { code: string };
  timestamps: {
    created_at: string;
    updated_at: string;
    detected_at: string | null;
    settled_at: string | null;
    failed_at: string | null;
    expired_at: string | null;
  };
  /** The server's clock when it answered. Corrects the countdown and latency readouts for skew. */
  server_time: string;
  /** Oldest first. */
  events: PayEvent[];
}
