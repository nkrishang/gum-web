import "server-only";

import { walletConnectProjectId } from "@/lib/env";

/** WalletConnect's wallet directory (the catalogue its modal lists). */
export const REGISTRY_URL = "https://api.web3modal.org";

export function registryHeaders(): Record<string, string> {
  return {
    "x-project-id": walletConnectProjectId,
    "x-sdk-type": "appkit",
    "x-sdk-version": "html-wagmi-5.0.0",
  };
}
