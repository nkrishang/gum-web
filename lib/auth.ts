"use client";

import * as React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PrivyConfiguredContext } from "@/components/providers";

/**
 * Session state that is safe to read even when Privy is not configured
 * (no NEXT_PUBLIC_PRIVY_APP_ID): it reports `ready: true, authenticated: false`.
 *
 * `configured` is fixed for the lifetime of the app (it comes from a build-time env var),
 * so the hook order below never changes between renders.
 */
export function useSession() {
  const configured = React.useContext(PrivyConfiguredContext);
  if (!configured) {
    return { configured: false, ready: true, authenticated: false, user: null } as const;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { ready, authenticated, user } = usePrivy();
  return { configured: true, ready, authenticated, user } as const;
}

/** A short label for the signed-in user: email, social handle, or wallet. */
export function userLabel(user: ReturnType<typeof useSession>["user"]): string {
  if (!user) return "";
  const u = user as {
    email?: { address?: string } | null;
    google?: { email?: string } | null;
    github?: { username?: string } | null;
    wallet?: { address?: string } | null;
  };
  return (
    u.email?.address ??
    u.google?.email ??
    (u.github?.username ? `@${u.github.username}` : undefined) ??
    (u.wallet?.address ? `${u.wallet.address.slice(0, 6)}…${u.wallet.address.slice(-4)}` : undefined) ??
    "Signed in"
  );
}
