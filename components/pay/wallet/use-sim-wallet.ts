"use client";

import * as React from "react";
import type { Address, Hex } from "viem";
import { SIM_PAYER, type Simulator } from "@/lib/pay/simulator";
import { popularFill } from "@/lib/pay/wallets";
import type { WalletApi, WalletOption } from "./types";

const INSTALLED: WalletOption[] = [
  { id: "sim-metamask", name: "MetaMask", icon: "/logos/metamask.svg", kind: "installed" },
  { id: "sim-rabby", name: "Rabby", icon: "/logos/rabby.svg", kind: "installed" },
];

const OPTIONS: WalletOption[] = [
  ...INSTALLED,
  ...popularFill([
    { name: "MetaMask", rdns: "io.metamask" },
    { name: "Rabby", rdns: "io.rabby" },
  ]).map(
    (w): WalletOption => ({
      id: `${w.via}:${w.rdns}`,
      name: w.name,
      icon: w.icon,
      kind: "popular",
      via: w.via,
      mobileLink: w.via === "walletconnect" ? w.mobileLink : undefined,
    }),
  ),
  { id: "explore", name: "Explore wallets", kind: "explore" },
];

/** A pairing URI shaped like WalletConnect's, for the popular-wallet QR code. */
function fakePairingUri() {
  const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  const expiry = Math.floor(Date.now() / 1000) + 300;
  return `wc:${hex(32)}@2?relay-protocol=irn&symKey=${hex(32)}&expiryTimestamp=${expiry}`;
}

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
  /** The wallet connected: a listed one, or any wallet picked from the directory. */
  const [wallet, setWallet] = React.useState<WalletOption | null>(null);
  const [chainId, setChainId] = React.useState<number>(1);
  /** "Doesn't have the network": the payment's chain is unknown to the wallet until added. */
  const [added, setAdded] = React.useState(false);
  const knows = (id: number) => id === 1 || behavior !== "missing_chain" || added;
  const unknownChain = () => Object.assign(new Error("Unrecognized chain ID. Try adding the chain first."), { code: 4902 });
  const [spent, setSpent] = React.useState(0n);
  const reverts = React.useRef(new Set<Hex>());
  const pairing = React.useRef(0);

  const deposit = React.useSyncExternalStore(sim.subscribe, () => sim.getSnapshot().deposit, () => null);
  const amount = deposit ? BigInt(deposit.amount) : 0n;
  const unit = 10n ** BigInt(deposit?.token_decimals ?? 6);
  const startBalance = behavior === "insufficient" ? amount / 3n : amount * 4n + 1_234n * unit;
  const tokenBalance = status === "connected" ? (startBalance > spent ? startBalance - spent : 0n) : undefined;
  const nativeBalance = status === "connected" ? (behavior === "no_gas" ? 0n : 42_000_000_000_000_000n) : undefined;

  return {
    simulated: true,
    status,
    address: status === "connected" ? (SIM_PAYER as Address) : undefined,
    chainId: status === "connected" ? chainId : undefined,
    walletName: wallet?.name,
    walletIcon: wallet?.icon,
    options: OPTIONS,
    optionsReady: true,
    async connect(option, onUri) {
      const attempt = ++pairing.current;
      setStatus("connecting");
      if (option.via === "walletconnect") {
        // As if the payer scanned the code a few seconds later.
        await wait(250);
        onUri?.(fakePairingUri());
        await wait(3_500);
        if (attempt !== pairing.current) throw new Error("Connection request reset.");
      }
      await wait(700);
      if (behavior === "reject") {
        setStatus("disconnected");
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      // "Scan with any wallet" answers as some phone wallet, as a real session would name it.
      setWallet(option.id === "walletconnect:any" ? { ...option, name: "Trust Wallet", icon: "/logos/trust.svg" } : option);
      // Wallets usually come up on whatever network they were last on.
      setChainId(behavior === "wrong_chain" || behavior === "missing_chain" ? 1 : target);
      setStatus("connected");
    },
    cancelConnect() {
      pairing.current++;
      setStatus("disconnected");
    },
    // As if the payer opened the page in the wallet's app on their phone and paid there.
    onHandoff() {
      const attempt = ++pairing.current;
      setTimeout(() => {
        if (attempt === pairing.current) sim.sendExternal("full");
      }, 6_000);
    },
    disconnect() {
      setStatus("disconnected");
      setWallet(null);
    },
    async switchChain(id) {
      await wait(650);
      if (!knows(id)) throw unknownChain();
      setChainId(id);
    },
    async addChain(id) {
      await wait(900);
      setAdded(true);
      setChainId(id);
    },
    tokenBalance,
    nativeBalance,
    refreshBalances() {},
    async transfer(request, onStage) {
      if (chainId !== request.chainId) {
        onStage?.("switching");
        await wait(650);
        if (!knows(request.chainId)) throw unknownChain();
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
