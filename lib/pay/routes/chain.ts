import { createPublicClient, defineChain, erc20Abi, fallback, http, type Address, type Chain, type PublicClient } from "viem";
import { RPC_OVERRIDES } from "@/lib/pay/wagmi";
import { NATIVE, type SourceChain, type SourceToken } from "./types";

/**
 * Reads on any chain Relay routes from. The page's own chains use the same RPCs as the rest of the
 * widget (with their overrides); the others use Relay's public RPC for the chain. Requests made in
 * the same tick go out as JSON-RPC batches, so a chain's whole balance sheet is a few round trips.
 */

const clients = new Map<number, PublicClient>();

export function viemChain(c: SourceChain): Chain {
  return defineChain({
    id: c.id,
    name: c.name,
    nativeCurrency: { name: c.native.name || c.native.symbol, symbol: c.native.symbol, decimals: c.native.decimals },
    rpcUrls: { default: { http: [c.rpc_url] } },
    blockExplorers: c.explorer_url ? { default: { name: c.name, url: c.explorer_url } } : undefined,
  });
}

export function publicClientFor(c: SourceChain): PublicClient {
  let client = clients.get(c.id);
  if (!client) {
    // Three to a batch: several of Relay's public RPCs (drpc's free tier) refuse larger ones, and
    // a chain's balance sheet is still only a few round trips.
    const options = { batch: { batchSize: 3, wait: 16 }, timeout: 8_000, retryCount: 1 };
    const override = RPC_OVERRIDES[c.id];
    client = createPublicClient({
      chain: viemChain(c),
      transport: override ? fallback([http(override, options), http(c.rpc_url, options)]) : http(c.rpc_url, options),
    }) as PublicClient;
    clients.set(c.id, client);
  }
  return client;
}

/** `owner`'s balance of each token (the zero address is the native currency); null where a read failed. */
export async function readBalances(c: SourceChain, owner: Address, tokens: SourceToken[]): Promise<(bigint | null)[]> {
  const client = publicClientFor(c);
  return Promise.all(
    tokens.map((t) =>
      (t.address === NATIVE
        ? client.getBalance({ address: owner })
        : client.readContract({ address: t.address as Address, abi: erc20Abi, functionName: "balanceOf", args: [owner] })
      ).catch(() => null),
    ),
  );
}
