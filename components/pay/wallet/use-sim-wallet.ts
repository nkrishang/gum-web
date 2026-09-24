"use client";

import * as React from "react";
import type { Address, Hex } from "viem";
import { SIM_PAYER, type Simulator } from "@/lib/pay/simulator";
import type { WalletApi, WalletOption } from "./types";

const OPTIONS: WalletOption[] = [
  { id: "sim-metamask", name: "MetaMask", icon: "/logos/metamask.svg", kind: "installed" },
  { id: "sim-rabby", name: "Rabby", icon: "/logos/rabby.svg", kind: "installed" },
  { id: "sim-explore", name: "Explore wallets", kind: "explore" },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Test mode's wallet. It connects, switches networks, holds balances and "signs" on a timer, and
 * its transfers go to the simulator instead of a chain. `walletBehavior` in the test panel makes it
 * decline, come up short, have no gas, sit on the wrong network or revert.
 */
export function useSimWallet(sim: Simulator): WalletApi {
  const controls = React.useSyncExternalStore(sim.subscribeControls, sim.getControls, sim.getControls);
  const behavior = controls.walletBehavior;
  const target = sim.network.chain.id;
  const [status, setStatus] = React.useState<WalletApi["status"]>("disconnected");
  const [walletId, setWalletId] = React.useState<string | null>(null);
  const [chainId, setChainId] = React.useState<number>(1);
  const [spent, setSpent] = React.useState(0n);
  const reverts = React.useRef(new Set<Hex>());

  const deposit = React.useSyncExternalStore(sim.subscribe, () => sim.getSnapshot().deposit, () => null);
  const amount = deposit ? BigInt(deposit.amount) : 0n;
  const unit = 10n ** BigInt(deposit?.token_decimals ?? 6);
  const startBalance = behavior === "insufficient" ? amount / 3n : amount * 4n + 1_234n * unit;
  const tokenBalance = status === "connected" ? (startBalance > spent ? startBalance - spent : 0n) : undefined;
  const nativeBalance = status === "connected" ? (behavior === "no_gas" ? 0n : 42_000_000_000_000_000n) : undefined;
  const wallet = OPTIONS.find((o) => o.id === walletId);

  return {
    simulated: true,
    status,
    address: status === "connected" ? (SIM_PAYER as Address) : undefined,
    chainId: status === "connected" ? chainId : undefined,
    walletName: wallet?.name,
    walletIcon: wallet?.icon,
    options: OPTIONS,
    optionsReady: true,
    async connect(optionId) {
      setStatus("connecting");
      await wait(700);
      if (behavior === "reject") {
        setStatus("disconnected");
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      setWalletId(optionId);
      // Wallets usually come up on whatever network they were last on.
      setChainId(behavior === "wrong_chain" ? 1 : target);
      setStatus("connected");
    },
    disconnect() {
      setStatus("disconnected");
      setWalletId(null);
    },
    async switchChain(id) {
      await wait(650);
      setChainId(id);
    },
    tokenBalance,
    nativeBalance,
    refreshBalances() {},
    async transfer(request, onStage) {
      if (chainId !== request.chainId) {
        onStage?.("switching");
        await wait(650);
        setChainId(request.chainId);
      }
      if ((tokenBalance ?? 0n) < request.amount) {
        throw new Error("ERC20: transfer amount exceeds balance");
      }
      if (nativeBalance === 0n) throw new Error("insufficient funds for gas * price + value");
      onStage?.("signing");
      await wait(1_300);
      if (behavior === "reject") throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      if (behavior === "revert") {
        const hash = `0x${"de".repeat(32)}` as Hex;
        reverts.current.add(hash);
        return hash;
      }
      setSpent((s) => s + request.amount);
      return sim.walletTransfer(request.amount, SIM_PAYER) as Hex;
    },
    async waitForReceipt(hash) {
      await wait(Math.max(600, sim.network.blockTimeMs * 1.5));
      return reverts.current.has(hash) ? "reverted" : "success";
    },
  };
}
