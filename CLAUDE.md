# gum-web

Landing page + dashboard for Gum (gum.money). Next.js 16 App Router, React 19, Tailwind v4, shadcn (Base UI), Privy for auth, TanStack Query for data. Deployed on Vercel.

## Layout

- Icons: `app/icon0.svg` (SVG favicon), `app/icon1.png` (PNG fallback), `public/favicon.ico` (legacy path), `app/apple-icon.png`. Next only registers new files under `app/` for metadata routes on dev-server start, so restart `pnpm dev` after adding one.
- `app/(site)/` — landing, login and dashboard, under the Privy + React Query providers. `app/pay` sits outside the group so payers never download Privy.
- `app/(site)/page.tsx` — the landing page, ported from `../stablecoin-gateway/web` (same look, copy and assets). Components in `components/landing/`, assets in `public/gum`, `public/logos`, `public/payment-icons`. It uses Inter and JetBrains Mono via the `.landing` class; the dashboard keeps Geist.
- `app/(site)/login` — Privy sign-in. Redirects to `?next=` (default `/dashboard`).
- `app/(site)/dashboard` — one page, client-gated (`components/dashboard/shell.tsx`), with three sections stacked: API key, webhooks, deposits (read-only table; no detail page). No sidebar; the header carries Pricing, Docs and Sign out.
- `app/api/gum/[...path]` — allowlisted same-origin proxy to gum-server. gum-server sends no CORS headers, so the browser never calls it directly. The Privy access token is forwarded as `Authorization: Bearer`; the API verifies it.
- `app/pay/[id]` — the hosted pay page for one deposit request (`?return_url=`, `?theme=dark`, `?embed=1`). Server-renders the payer view, then `components/pay/pay-widget.tsx` keeps it live. End-user UI only: no developer readouts on the page. The widget is self-contained (own wagmi + query client) so apps can embed it. `/pay/test` is test mode: the same widget over `lib/pay/simulator.ts` and a simulated wallet, with a panel to reach every state (`?scenario=&network=&token=&amount=`).
- `app/api/pay/[id]` — public proxy to gum-server's `GET /v1/pay/{id}` (payer view, no auth; `after`/`wait` long-poll). `lib/pay/feed.ts` long-polls it; `lib/pay/model.ts` derives the page's phase from a deposit; `lib/pay/networks.ts` is the chain/token allowlist a wallet payment must match (mirror gum-server's registry when adding a chain). `lib/pay/wallets.ts` is the popular-wallet list that fills the wallet tab after detected extensions, and how each connects (WalletConnect, Coinbase SDK, or a hand-off into the wallet's app browser for Phantom). WalletConnect's own modal is off (`showQrModal: false`): the widget renders every pairing QR / deep link itself, and "Explore wallets" lists WalletConnect's directory for the payment's network through `app/api/wallets` (cached; logos via `app/api/wallets/image/[id]`).
- Paying with any token on any chain (Relay): `app/api/pay/[id]/[...path]` is the allowlisted public proxy to gum-server's `/v1/pay/{id}/sources`, `/sources/tokens`, `/prices`, `/quote`, `/routes/{request_id}[/transactions]`. gum-server holds the Relay key and pins every route to the deposit (chain, token, exact amount, payment address) and checks Relay's answer; the page only picks what to pay with. `lib/pay/routes/*`: wire types, client, `chain.ts` (balance reads on any Relay chain, JSON-RPC batches of 3 because drpc's free tier refuses more), `execute.ts` (sends a route's steps through the wallet's own EIP-1193 provider, since wagmi's config only has the page's four chains), `sim.ts` (test mode's Relay). `components/pay/use-pay-with.ts` loads sources, scans the wallet across every chain, prices and ranks holdings (the requested token first and default, then what covers the payment, same token first) and keeps a quote fresh; `pay-panel.tsx` is the connected wallet's pane (the shortlist of ways to pay, each with its cost in that token; one terms line; one button that pays either way), `pay-with.tsx` the full "All tokens" list. A routed payment is tracked by `requestId` (Relay status) in `widget.tsx` and gets a Route checkpoint in `progress.tsx`; a refund puts the page back to paying. The QR code and address tabs stay the requested token only.
- `lib/gum/*` — wire types, fetch client, React Query hooks. `lib/format.ts` — amounts (BigInt), addresses, dates, statuses.

## Conventions

- Brand tokens live in `app/globals.css`: `--brand` (#FF5CA8), `--ink` (#121212), `--paper` (#F7F7F5). Button has `brand` and `ink` variants. The landing page uses its own `gum-white/pink/black/grey` colours and `.landing-*` CSS, kept in sync with stablecoin-gateway.
- shadcn v4 components use Base UI: pass `render={<Link/>}` instead of `asChild`.
- Amounts from the API are base-unit integer strings. Format with `formatUnits`, never floats.
- Keep copy short. No marketing fluff.

## Commands

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm exec tsc --noEmit` (run `pnpm exec next typegen` first for route types).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
