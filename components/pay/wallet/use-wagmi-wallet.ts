"use client";

import * as React from "react";
import { erc20Abi, numberToHex, type Address, type EIP1193Provider, type Hex } from "viem";
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
import { popularFill, WALLET_ROWS } from "@/lib/pay/wallets";
import type { TransferRequest, WalletApi, WalletOption } from "./types";

const ZERO: Address = "0x0000000000000000000000000000000000000000";

const noop = () => () => {};

function hasInjectedProvider() {
  return typeof window !== "undefined" && Boolean((window as { ethereum?: unknown }).ethereum);
}

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

  const walletConnect = connectors.find((c) => c.type === "walletConnect");
  const coinbase = connectors.find((c) => c.type === "coinbaseWallet");

  // Detected extensions, then popular wallets to fill the list, then "Explore wallets", last.
  const options = React.useMemo<WalletOption[]>(() => {
    const discovered = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
    const seen = new Set<string>();
    const installed: WalletOption[] = [];
    for (const c of connectors) {
      if (c.type === "walletConnect" || c.type === "coinbaseWallet") continue;
      // wagmi always carries a generic injected connector. It stands for a real wallet only when
      // one injected itself without announcing (older extensions, some in-app browsers).
      if (c.id === "injected" && (discovered.length > 0 || !hasInjectedProvider())) continue;
      const key = c.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      installed.push({ id: c.uid, name: c.id === "injected" ? "Browser wallet" : c.name, icon: c.icon, kind: "installed" });
    }
    // wagmi folds Coinbase's extension into the SDK connector (same rdns); the extension marks
    // itself on window, so it is still listed as detected when it's there.
    const coinbaseExtension = typeof window !== "undefined" && "coinbaseWalletExtension" in window;
    if (coinbase && coinbaseExtension) {
      installed.push({ id: coinbase.uid, name: "Coinbase Wallet", icon: "/logos/coinbase.svg", kind: "installed" });
    }
    // EIP-6963 connectors are keyed by the wallet's rdns.
    const detected = [
      ...discovered.map((c) => ({ name: c.name, rdns: c.id })),
      ...(coinbaseExtension ? [{ name: "Coinbase Wallet", rdns: "com.coinbase.wallet" }] : []),
    ];
    // Every row already listed takes a slot, so the list never outgrows its frame.
    const popular = popularFill(detected, (w) =>
      w.via === "walletconnect" ? Boolean(walletConnect) : w.via === "coinbase" ? Boolean(coinbase) : true,
    )
      .slice(0, Math.max(0, WALLET_ROWS - installed.length))
      .map(
        (w): WalletOption => ({
          id: w.via === "coinbase" ? coinbase!.uid : `${w.via}:${w.rdns}`,
          name: w.name,
          icon: w.icon,
          kind: "popular",
          via: w.via,
          mobileLink: w.via === "walletconnect" ? w.mobileLink : undefined,
        }),
      );
    const explore: WalletOption[] = walletConnect ? [{ id: "explore", name: "Explore wallets", kind: "explore" }] : [];
    return [...installed, ...popular, ...explore];
  }, [connectors, walletConnect, coinbase]);

  // Through WalletConnect the connector is "WalletConnect"; the wallet the payer actually picked
  // introduces itself in the session. Keyed by connector and account so a stale name never shows.
  const connector = connection.connector;
  const peerKey = connector?.type === "walletConnect" && address ? `${connector.uid}:${address}` : null;
  const [peer, setPeer] = React.useState<{ key: string; name?: string; icon?: string } | null>(null);
  React.useEffect(() => {
    if (!peerKey || !connector) return;
    let cancelled = false;
    void connector
      .getProvider()
      .then((provider) => {
        const meta = (provider as { session?: { peer?: { metadata?: { name?: string; icons?: string[] } } } } | undefined)?.session
          ?.peer?.metadata;
        if (!cancelled && meta) setPeer({ key: peerKey, name: meta.name, icon: meta.icons?.[0] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [peerKey, connector]);
  const peerInfo = peer && peer.key === peerKey ? peer : null;
  const walletName = connector?.type === "walletConnect" ? (peerInfo?.name ?? "Wallet") : connector?.name;
  const walletIcon =
    connector?.type === "walletConnect"
      ? peerInfo?.icon
      : (connector?.icon ?? (connector?.type === "coinbaseWallet" ? "/logos/coinbase.svg" : undefined));

  const refetchToken = token.refetch;
  const refetchNative = native.refetch;

  return {
    simulated: false,
    status: connection.status,
    address,
    chainId: connection.chainId,
    walletName,
    walletIcon,
    options: mounted ? options : [],
    optionsReady: mounted,
    async connect(option, onUri) {
      if (option.via === "walletconnect") {
        if (!walletConnect) throw new Error("That wallet is no longer available.");
        // WalletConnect's modal is off: the pairing URI arrives as a message, and the pane shows it
        // as this wallet's QR code, or opens its app with it.
        const onMessage = ({ type, data }: { type: string; data?: unknown }) => {
          if (type === "display_uri" && typeof data === "string") onUri?.(data);
        };
        walletConnect.emitter.on("message", onMessage);
        try {
          await connectAsync({ connector: walletConnect });
        } finally {
          walletConnect.emitter.off("message", onMessage);
        }
        return;
      }
      const connector = connectors.find((c) => c.uid === option.id);
      if (!connector) throw new Error("That wallet is no longer available.");
      await connectAsync({ connector });
    },
    cancelConnect() {},
    // The payer finishes in the other app; this page follows the deposit as usual.
    onHandoff() {},
    disconnect: () => disconnect(),
    async switchChain(chainId) {
      await switchChainAsync({ chainId });
    },
    async addChain(chainId) {
      const chain = config.chains.find((c) => c.id === chainId);
      const connector = connection.connector;
      if (!chain || !connector) throw new Error("This network isn't available.");
      const provider = (await connector.getProvider()) as EIP1193Provider;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: numberToHex(chain.id),
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
          },
        ],
      });
      // Most wallets switch on adding; ask anyway, so the wallet ends up where the payment is.
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
