import { NextResponse, type NextRequest } from "next/server";
import { REGISTRY_URL, registryHeaders } from "@/lib/pay/registry";

/** A wallet's logo from WalletConnect's directory, served from our origin and cached for a week. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/wallets/image/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  try {
    const res = await fetch(`${REGISTRY_URL}/getWalletImage/${id}`, {
      headers: registryHeaders(),
      next: { revalidate: 604_800 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    return new NextResponse(res.body, {
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/webp",
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
