/** Wire types for api.gum.money (see gum-server README). */

export type DepositStatus = "pending" | "partial_paid" | "paid" | "settled" | "failed" | "expired";

export const DEPOSIT_STATUSES: DepositStatus[] = [
  "pending",
  "partial_paid",
  "paid",
  "settled",
  "failed",
  "expired",
];

export interface DepositTimestamps {
  created_at: string;
  updated_at: string;
  detected_at: string | null;
  settled_at: string | null;
  failed_at: string | null;
  expired_at: string | null;
}

export interface DepositFailure {
  code: string;
  message: string;
}

export interface DepositEvent {
  id: string;
  sequence: number;
  type: string;
  data: unknown;
  created_at: string;
}

export interface Deposit {
  id: string;
  status: DepositStatus;
  payment_address: string;
  chain_id: number;
  token: string;
  token_address: string;
  token_decimals: number;
  /** Base units, decimal string. */
  amount: string;
  confirmed_amount: string;
  receiver: string;
  recovery: string;
  salt: string;
  reference?: string;
  webhook_url?: string;
  expires_at: string;
  tx_hash?: string;
  block_number?: number;
  failure?: DepositFailure;
  timestamps: DepositTimestamps;
  events?: DepositEvent[];
}

export interface DepositList {
  items: Deposit[];
  next_cursor?: string;
}

export interface DepositFilters {
  status?: DepositStatus | "";
  chain_id?: string;
  token?: string;
  reference?: string;
  payment_address?: string;
  receiver?: string;
  created_after?: string;
  created_before?: string;
  limit?: number;
}

export interface ApiKeyInfo {
  prefix: string;
  created_at: string;
  rotated_at: string | null;
  last_used_at: string | null;
}

export interface Account {
  user_id: string;
  api_key: ApiKeyInfo | null;
  webhook_url: string | null;
  webhook_secret: string;
  created_at: string;
}

export interface IssuedKey {
  /** Shown exactly once. */
  api_key: string;
  prefix: string;
  created_at: string;
  rotated_at: string | null;
}

export interface ChainToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface Chain {
  name: string;
  chain_id: number;
  factory: string;
  tokens: ChainToken[];
}

export interface ChainList {
  chains: Chain[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
