# gum-web

Landing page + dashboard for Gum (gum.money). Next.js 16 App Router, React 19, Tailwind v4, shadcn (Base UI), Privy for auth, TanStack Query for data. Deployed on Vercel.

## Layout

- Icons: `app/icon0.svg` (SVG favicon), `app/icon1.png` (PNG fallback), `public/favicon.ico` (legacy path), `app/apple-icon.png`. Next only registers new files under `app/` for metadata routes on dev-server start, so restart `pnpm dev` after adding one.
- `app/page.tsx` — the landing page, ported from `../stablecoin-gateway/web` (same look, copy and assets). Components in `components/landing/`, assets in `public/gum`, `public/logos`, `public/payment-icons`. It uses Inter and JetBrains Mono via the `.landing` class; the dashboard keeps Geist.
- `app/login` — Privy sign-in. Redirects to `?next=` (default `/dashboard`).
- `app/dashboard` — one page, client-gated (`components/dashboard/shell.tsx`), with three sections stacked: API key, webhooks, deposits (read-only table; no detail page). No sidebar; the header carries Pricing, Docs and Sign out.
- `app/api/gum/[...path]` — allowlisted same-origin proxy to gum-server. gum-server sends no CORS headers, so the browser never calls it directly. The Privy access token is forwarded as `Authorization: Bearer`; the API verifies it.
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
