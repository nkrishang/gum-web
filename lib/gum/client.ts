import type {
  Account,
  ApiErrorBody,
  ChainList,
  DepositFilters,
  DepositList,
  IssuedKey,
} from "./types";

/** Thrown for any non-2xx response from the API (via the /api/gum proxy). */
export class GumApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null) {
    super(message);
    this.name = "GumApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export type TokenGetter = () => Promise<string | null>;

async function request<T>(
  getToken: TokenGetter,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  if (!token) {
    throw new GumApiError(401, "no_session", "You are signed out. Sign in again to continue.", null);
  }
  const res = await fetch(`/api/gum/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const requestId = res.headers.get("x-request-id");
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new GumApiError(
      res.status,
      err?.code ?? `http_${res.status}`,
      err?.message ?? (text || res.statusText || "Request failed"),
      requestId,
    );
  }
  return json as T;
}

function query(filters: DepositFilters, cursor?: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Typed client for the parts of the API the dashboard uses. */
export function createGumClient(getToken: TokenGetter) {
  return {
    account: {
      get: () => request<Account>(getToken, "GET", "account"),
      update: (webhook_url: string | null) =>
        request<Account>(getToken, "PATCH", "account", { webhook_url }),
      createKey: () => request<IssuedKey>(getToken, "POST", "account/api-key"),
      rotateKey: () => request<IssuedKey>(getToken, "POST", "account/api-key/rotate"),
      rotateWebhookSecret: () =>
        request<Account>(getToken, "POST", "account/webhook-secret/rotate"),
    },
    deposits: {
      list: (filters: DepositFilters, cursor?: string) =>
        request<DepositList>(getToken, "GET", `deposit${query(filters, cursor)}`),
    },
    chains: {
      list: () => request<ChainList>(getToken, "GET", "chains"),
    },
  };
}

export type GumClient = ReturnType<typeof createGumClient>;
