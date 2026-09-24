"use client";

import * as React from "react";
import { erc20Abi, type Address, type Hex } from "viem";
import {
  useBalance,
  useConfig,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { getConnection, simulateContract, waitForTransactionReceipt } from "wagmi/actions";
import type { TransferRequest, WalletApi, WalletOption } from "./types";

const ZERO: Address = "0x0000000000000000000000000000000000000000";

const noop = () => () => {};

/** True after hydration, false on the server and in the hydrating render. */
function useMounted() {
  return React.useSyncExternalStore(noop, () => true, () => false);
}

/**
 * The real wallet, through wagmi. `target` is the payment's chain and token: balances are read
 * there, whatever network the wallet happens to be on.
 */
export function useWagmiWallet(target: { chainId: number; token: Address } | null): WalletApi {
  const config = useConfig();
  const connection = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connectAsync } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChainAsync } = useSwitchChain();
  const { mutateAsync: writeContractAsync } = useWriteContract();

  const mounted = useMounted();
  const address = connection.address;
  const enabled = Boolean(address && target);

  const token = useReadContract({
    address: target?.token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? ZERO],
    chainId: target?.chainId,
    query: { enabled, refetchInterval: 12_000 },
  });
  const native = useBalance({
    address,
    chainId: target?.chainId,
    query: { enabled, refetchInterval: 12_000 },
  });

  const options = React.useMemo<WalletOption[]>(() => {
    const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
    const seen = new Set<string>();
    const out: WalletOption[] = [];
    for (const c of connectors) {
      // The generic injected connector only matters when nothing announced itself.
      if (c.id === "injected" && discovered.length > 0) continue;
      const key = c.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(
        c.type === "walletConnect"
          ? { id: c.uid, name: "Explore wallets", kind: "explore" }
          : { id: c.uid, name: c.id === "injected" ? "Browser wallet" : c.name, icon: c.icon, kind: "installed" },
      );
    }
    return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "installed" ? -1 : 1));
  }, [connectors]);

  const refetchToken = token.refetch;
  const refetchNative = native.refetch;

  return {
    simulated: false,
    status: connection.status,
    address,
    chainId: connection.chainId,
    walletName: connection.connector?.name,
    walletIcon: connection.connector?.icon,
    options: mounted ? options : [],
    optionsReady: mounted,
    async connect(optionId) {
      const connector = connectors.find((c) => c.uid === optionId);
      if (!connector) throw new Error("That wallet is no longer available.");
      await connectAsync({ connector });
    },
    disconnect: () => disconnect(),
    async switchChain(chainId) {
      await switchChainAsync({ chainId });
    },
    tokenBalance: token.data,
    nativeBalance: native.data?.value,
    refreshBalances() {
      void refetchToken();
      void refetchNative();
    },
    async transfer(request: TransferRequest, onStage) {
      if (getConnection(config).chainId !== request.chainId) {
        onStage?.("switching");
        await switchChainAsync({ chainId: request.chainId });
      }
      // Some wallets report success and stay where they were. Never sign on the wrong chain.
      const now = getConnection(config);
      if (now.chainId !== request.chainId || !now.address) {
        throw new Error("chain mismatch: the wallet did not switch networks");
      }
      // A dry run first: a transfer that would revert fails here, in plain words, before the
      // wallet asks for anything.
      await simulateContract(config, {
        account: now.address,
        chainId: request.chainId,
        address: request.token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [request.to, request.amount],
      });
      onStage?.("signing");
      return writeContractAsync({
        chainId: request.chainId,
        address: request.token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [request.to, request.amount],
      });
    },
    async waitForReceipt(hash: Hex, chainId: number) {
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      return receipt.status;
    },
  };
}
