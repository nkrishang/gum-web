import type { Address, Hex } from "viem";

/**
 * Everything the wallet pane needs from a wallet. The live page backs it with wagmi; test mode
 * backs it with a simulated wallet that never touches a chain, so a real wallet can never send
 * real money to a test address.
 */

export interface WalletOption {
  id: string;
  name: string;
  icon?: string;
  /**
   * "installed": an extension that announced itself in this browser. "popular": a well-known
   * wallet that isn't installed, paired over WalletConnect by its own QR code or deep link.
   * "explore": every other wallet, through the WalletConnect modal's catalogue. Always last.
   */
  kind: "installed" | "popular" | "explore";
  /** Popular wallets: how they connect (see lib/pay/wallets.ts). */
  via?: "walletconnect" | "coinbase" | "handoff";
  /** WalletConnect wallets: the app's deep link. */
  mobileLink?: string;
}

export interface TransferRequest {
  chainId: number;
  token: Address;
  to: Address;
  amount: bigint;
}

export interface WalletApi {
  simulated: boolean;
  status: "disconnected" | "connecting" | "reconnecting" | "connected";
  address?: Address;
  chainId?: number;
  walletName?: string;
  walletIcon?: string;
  options: WalletOption[];
  /** False until the browser has had a chance to discover wallets (never during server render). */
  optionsReady: boolean;
  /** Resolves once connected. A popular wallet reports its pairing URI through `onUri` first. */
  connect(optionId: string, onUri?: (uri: string) => void): Promise<void>;
  /** Abandons a pairing in progress. */
  cancelConnect(): void;
  /** The payer was sent to finish in another app (a hand-off). Test mode plays the phone's part. */
  onHandoff(optionId: string): void;
  disconnect(): void;
  switchChain(chainId: number): Promise<void>;
  /** On the payment's chain. Undefined while unknown. */
  tokenBalance?: bigint;
  nativeBalance?: bigint;
  refreshBalances(): void;
  /** Switches chain if needed, checks it took, and sends a plain ERC-20 transfer. */
  transfer(request: TransferRequest, onStage?: (stage: "switching" | "signing") => void): Promise<Hex>;
  waitForReceipt(hash: Hex, chainId: number): Promise<"success" | "reverted">;
}
