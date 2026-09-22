import { NextResponse, type NextRequest } from "next/server";
import { gumApiUrl } from "@/lib/server-env";

/**
 * Same-origin proxy in front of api.gum.money.
 *
 * gum-server does not send CORS headers, so the browser cannot call it directly. This handler
 * forwards a strict allowlist of routes, passing the Privy access token through untouched.
 * The API verifies the token itself; nothing here grants access.
 */

const ALLOWED: Array<{ method: string; pattern: RegExp }> = [
  { method: "GET", pattern: /^account$/ },
  { method: "PATCH", pattern: /^account$/ },
  { method: "POST", pattern: /^account\/api-key$/ },
  { method: "POST", pattern: /^account\/api-key\/rotate$/ },
  { method: "POST", pattern: /^account\/webhook-secret\/rotate$/ },
  { method: "GET", pattern: /^deposit$/ },
  { method: "GET", pattern: /^chains$/ },
];

const PASS_RESPONSE_HEADERS = ["content-type", "x-request-id", "idempotent-replayed"];

async function proxy(req: NextRequest, ctx: RouteContext<"/api/gum/[...path]">) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const allowed = ALLOWED.some((r) => r.method === req.method && r.pattern.test(joined));
  if (!allowed) {
    return NextResponse.json(
      { error: { code: "not_found", message: "no such route" } },
      { status: 404 },
    );
  }

  const auth = req.headers.get("authorization");
  if (!auth) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "missing credentials" } },
      { status: 401 },
    );
  }

  const url = new URL(`${gumApiUrl}/v1/${joined}`);
  url.search = req.nextUrl.search;

  const headers: Record<string, string> = { authorization: auth, accept: "application/json" };
  const hasBody = req.method !== "GET";
  const body = hasBody ? await req.text() : undefined;
  if (hasBody) headers["content-type"] = "application/json";

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
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
      { status: 502 },
    );
  }

  const out = new Headers({ "cache-control": "no-store" });
  for (const name of PASS_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PATCH };
