# gum-web

The website and dashboard for [Gum](https://gum.money): a landing page, Privy sign-in, and an admin
dashboard to manage your API key, register a webhook endpoint, and browse the deposit requests your
app created through [api.gum.money](https://github.com/nkrishang/gum-server).

## Routes

| Route | What |
|---|---|
| `/` | Landing page (ported from stablecoin-gateway's web app) |
| `/login` | Privy sign-in |
| `/dashboard` | One page: API key, webhooks, deposits |
| `/api/gum/*` | Same-origin proxy to gum-server |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · shadcn/ui · Privy · TanStack Query · Vercel

## Run locally

```sh
pnpm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_PRIVY_APP_ID
pnpm dev                     # http://localhost:3000
```

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | yes | Privy app id. Must match `GUM_PRIVY__APP_ID` on gum-server. |
| `NEXT_PUBLIC_PRIVY_CLIENT_ID` | no | Privy client id, if you created a dedicated web client. |
| `GUM_API_URL` | no | gum-server base URL. Default `https://api.gum.money`. Server-side only. |
| `NEXT_PUBLIC_GUM_API_URL` | no | The URL shown in code snippets. |
| `NEXT_PUBLIC_SITE_URL` | no | Absolute base for Open Graph images. |

## How it talks to the API

The browser calls `/api/gum/*` on this app, which forwards an allowlist of routes to gum-server with the
user's Privy access token in `Authorization: Bearer`. gum-server verifies the token itself. This avoids
CORS (gum-server sends no CORS headers) and keeps the API base URL out of the client bundle.

Routes used: `GET/PATCH /v1/account`, `POST /v1/account/api-key`, `POST /v1/account/api-key/rotate`,
`POST /v1/account/webhook-secret/rotate`, `GET /v1/deposit`, `GET /v1/chains`.

## Deploy

Import the repo on Vercel, set the environment variables above, deploy. No other configuration is needed.
