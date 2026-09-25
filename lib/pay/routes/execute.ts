import {
  createWalletClient,
  custom,
  decodeFunctionData,
  erc20Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { isUnknownChain } from "@/components/pay/wallet/errors";
import { publicClientFor, viemChain } from "./chain";
import type { RouteQuote, RouteStep, SourceChain } from "./types";

export type RouteStage =
  | { kind: "switching"; chain: string }
  | { kind: "signing"; step: RouteStep; index: number; total: number }
  | { kind: "confirming"; step: RouteStep; index: number; total: number };

/**
 * Sends a route's origin transactions from the payer's wallet, in order. Straight through the
 * wallet's own provider rather than wagmi, whose config only knows the page's chains: a route can
 * start on any chain Relay supports. The wallet is moved to the origin chain (added first if it
 * doesn't know it) and checked to be there; every transaction is bound to that chain, so a wallet
 * that drifts can't sign one elsewhere. An approval the wallet already gave is skipped, and each
 * approval is mined before the deposit that spends it. Returns the last transaction's hash.
 */
export async function executeRoute(args: {
  provider: EIP1193Provider;
  account: Address;
  quote: RouteQuote;
  chain: SourceChain;
  onStage?: (stage: RouteStage) => void;
}): Promise<Hex> {
  const { provider, account, quote, chain, onStage } = args;
  const target = viemChain(chain);
  const wallet = createWalletClient({ account, transport: custom(provider) });
  const reader = publicClientFor(chain);

  if ((await wallet.getChainId()) !== chain.id) {
    onStage?.({ kind: "switching", chain: chain.name });
    try {
      await wallet.switchChain({ id: chain.id });
    } catch (cause) {
      if (!isUnknownChain(cause)) throw cause;
      await wallet.addChain({ chain: target });
      await wallet.switchChain({ id: chain.id });
    }
    if ((await wallet.getChainId()) !== chain.id) throw new Error("chain mismatch: the wallet did not switch networks");
  }

  const steps = quote.steps.filter((s) => s.chain_id === chain.id);
  if (steps.length !== quote.steps.length || steps.length === 0) throw new Error("This route can't be sent from here.");
  let last: Hex | null = null;
  for (const [index, step] of steps.entries()) {
    const total = steps.length;
    if (await alreadyApproved(step, account, chain)) continue;
    onStage?.({ kind: "signing", step, index, total });
    const hash = await wallet.sendTransaction({
      chain: target,
      to: step.to as Address,
      data: step.data as Hex,
      value: BigInt(step.value),
    });
    last = hash;
    if (index < total - 1) {
      onStage?.({ kind: "confirming", step, index, total });
      const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error(`The ${step.id} transaction failed on-chain.`);
    }
  }
  if (!last) throw new Error("Nothing was sent.");
  return last;
}

/** An `approve` step whose allowance is already in place. A zero amount is a zero-reset, which is
 * always sent: some tokens require it, and the allowance check can't speak for it. */
async function alreadyApproved(step: RouteStep, owner: Address, chain: SourceChain): Promise<boolean> {
  if (step.id !== "approve" && step.id !== "approval") return false;
  try {
    const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: step.data as Hex });
    if (functionName !== "approve") return false;
    const [spender, amount] = args as [Address, bigint];
    if (amount === 0n) return false;
    const allowance = await publicClientFor(chain).readContract({
      address: step.to as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    });
    return allowance >= amount;
  } catch {
    return false;
  }
}
