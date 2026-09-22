import { publicApiUrl } from "@/lib/env";

/** The example payment address the landing page and dashboard snippets both show. */
export const EXAMPLE_ADDRESS = "0x9a3F…A0c2";

/** A first deposit request from a backend, with native fetch. Shared by the landing page and the dashboard's empty state. */
export const HEADLESS_DEPOSIT_CODE = `const response = await fetch(
  "${publicApiUrl}/v1/deposit",
  {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.GUM_API_KEY}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": "order_8841",
    },
    body: JSON.stringify({
      chain: "base",
      token: "USDC",
      amount: "2500000", // 2.50 USDC, in base units
      receiver: "0xYourTreasury…",
      expires_at: "2026-10-01T00:00:00Z",
    }),
  },
);

const deposit: Deposit = await response.json();
deposit.payment_address; // "${EXAMPLE_ADDRESS}"`;
