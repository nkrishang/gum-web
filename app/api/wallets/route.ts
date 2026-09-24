import { NextResponse, type NextRequest } from "next/server";
import { walletConnectProjectId } from "@/lib/env";
import { REGISTRY_URL, registryHeaders } from "@/lib/pay/registry";
import type { RegistryWallet, WalletPage } from "@/lib/pay/wallets";

/**
 * WalletConnect's wallet directory, for the pay page's own "Explore wallets" list: the same
 * catalogue WalletConnect's modal shows, filtered to wallets that support the payment's network.
 * Fetched here so the list is cached once for everyone and logos come from our origin.
 */

const PAGE_SIZE = 40;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const chain = params.get("chain") ?? "";
  const page = Number(params.get("page") ?? "1");
  const search = (params.get("search") ?? "").trim().slice(0, 60);
  if (!walletConnectProjectId) return NextResponse.json({ count: 0, wallets: [] } satisfies WalletPage);
  if (!/^\d{1,12}$/.test(chain) || !Number.isInteger(page) || page < 1 || page > 50) {
    return NextResponse.json({ error: { code: "invalid_request", message: "chain and page are required" } }, { status: 400 });
  }

  const url = new URL(`${REGISTRY_URL}/getWallets`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("entries", String(PAGE_SIZE));
  url.searchParams.set("chains", `eip155:${chain}`);
  if (search) url.searchParams.set("search", search);

  let body: { count?: number; data?: Array<Record<string, unknown>> };
  try {
    const res = await fetch(url, {
      headers: registryHeaders(),
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`registry ${res.status}`);
    body = await res.json();
  } catch {
    return NextResponse.json({ error: { code: "upstream_unreachable", message: "Wallet list unavailable" } }, { status: 502 });
  }

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
  const wallets: RegistryWallet[] = (body.data ?? []).flatMap((w) => {
    const id = str(w.id);
    const name = str(w.name);
    if (!id || !name) return [];
    const image = str(w.image_id);
    return [
      {
        id,
        name,
        image: image ? `/api/wallets/image/${image}` : undefined,
        mobileLink: str(w.mobile_link) ?? str(w.link_mode),
        rdns: str(w.rdns),
      },
    ];
  });

  return NextResponse.json({ count: body.count ?? wallets.length, wallets } satisfies WalletPage, {
    headers: { "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

