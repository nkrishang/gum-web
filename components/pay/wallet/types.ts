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
  /** "Installed" extensions first; WalletConnect covers phone wallets. */
  kind: "installed" | "walletconnect";
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
  connect(optionId: string): Promise<void>;
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
