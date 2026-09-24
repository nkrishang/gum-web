import { NextResponse, type NextRequest } from "next/server";
import { DEPOSIT_ID } from "@/lib/pay/server";
import { gumApiUrl } from "@/lib/server-env";

/**
 * Same-origin proxy for the public payer view, `GET /v1/pay/{id}` on gum-server. No credentials:
 * the deposit id is the capability. The long-poll parameters pass through, and the response body
 * streams back as it arrives, so a change reaches the browser one hop after gum-server sees it.
 */

// The upstream holds a long-poll for up to ~25s; leave room for it.
export const maxDuration = 60;

const UPSTREAM_TIMEOUT_MS = 40_000;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/pay/[id]">) {
  const { id } = await ctx.params;
  if (!DEPOSIT_ID.test(id)) {
    return NextResponse.json(
      { error: { code: "not_found", message: "no such deposit" } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const url = new URL(`${gumApiUrl}/v1/pay/${id}`);
  for (const key of ["after", "wait"]) {
    const value = req.nextUrl.searchParams.get(key);
    if (value !== null && /^\d{1,19}$/.test(value)) url.searchParams.set(key, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
      // Ends the upstream wait if the payer closes the tab.
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return NextResponse.json(
      {
        error: {
          code: timeout ? "upstream_timeout" : "upstream_unreachable",
          message: timeout ? "The API did not answer in time." : "Could not reach the API.",
        },
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  const headers = new Headers({ "cache-control": "no-store" });
  for (const name of ["content-type", "x-request-id"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
