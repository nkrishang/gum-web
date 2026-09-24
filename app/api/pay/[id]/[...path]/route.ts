import { NextResponse, type NextRequest } from "next/server";
import { DEPOSIT_ID } from "@/lib/pay/server";
import { gumApiUrl } from "@/lib/server-env";

/**
 * Same-origin proxy for paying a deposit with any token (gum-server's `/v1/pay/{id}/sources`,
 * `/prices`, `/quote`, `/routes/…`, backed by Relay). Public like the payer view: the deposit id is
 * the capability, and gum-server holds the Relay key and pins every route to the deposit. Only
 * these routes pass, with small bodies.
 */

const REQUEST_ID = "0x[0-9a-fA-F]{64}";
const ALLOWED: Array<{ method: "GET" | "POST"; pattern: RegExp }> = [
  { method: "GET", pattern: /^sources$/ },
  { method: "GET", pattern: /^sources\/tokens$/ },
  { method: "POST", pattern: /^prices$/ },
  { method: "POST", pattern: /^quote$/ },
  { method: "GET", pattern: new RegExp(`^routes/${REQUEST_ID}$`) },
  { method: "POST", pattern: new RegExp(`^routes/${REQUEST_ID}/transactions$`) },
];
const MAX_BODY = 8_192;
const PASS_QUERY = ["q", "chain_id"];

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

async function proxy(req: NextRequest, ctx: RouteContext<"/api/pay/[id]/[...path]">) {
  const { id, path } = await ctx.params;
  const joined = path.join("/");
  if (!DEPOSIT_ID.test(id) || !ALLOWED.some((r) => r.method === req.method && r.pattern.test(joined))) {
    return error(404, "not_found", "no such route");
  }

  const url = new URL(`${gumApiUrl}/v1/pay/${id}/${joined}`);
  for (const key of PASS_QUERY) {
    const value = req.nextUrl.searchParams.get(key);
    if (value !== null && value.length <= 64) url.searchParams.set(key, value);
  }
  let body: string | undefined;
  if (req.method === "POST") {
    body = await req.text();
    if (body.length > MAX_BODY) return error(413, "too_large", "request body too large");
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body,
      cache: "no-store",
      redirect: "manual",
      // A quote waits on Relay (8s on gum-server's side).
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(15_000)]),
    });
  } catch (cause) {
    const timeout = cause instanceof Error && cause.name === "TimeoutError";
    return error(
      502,
      timeout ? "upstream_timeout" : "upstream_unreachable",
      timeout ? "The API did not answer in time." : "Could not reach the API.",
    );
  }

  const headers = new Headers({ "cache-control": upstream.headers.get("cache-control") ?? "no-store" });
  for (const name of ["content-type", "x-request-id"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const POST = proxy;
