"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLogout } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { LogOutIcon } from "lucide-react";
import { GumLogo } from "@/components/brand/logo";
import { PricingDialog } from "@/components/landing/pricing-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { links } from "@/lib/env";
import { QueriesPausedContext } from "@/lib/gum/hooks";
import { useSession, userLabel } from "@/lib/auth";

/**
 * The frame around the dashboard: the site's header with "Sign out" appended,
 * over one column. There are no section tabs; everything an account does day
 * to day is on /dashboard itself.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { configured, ready, authenticated } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // While the user is signing out the page stays put: the session drops before the
  // navigation to / lands, and that moment must not read as a lost session.
  const [signingOut, setSigningOut] = React.useState(false);
  // The header's label, captured when sign-out starts: Privy drops the user a
  // moment before the page is left, and the email should not vanish first.
  const [frozenLabel, setFrozenLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (signingOut) return;
    if (!configured || (ready && !authenticated)) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [configured, ready, authenticated, pathname, router, signingOut]);

  if (!configured || !ready || (!authenticated && !signingOut)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Loading your workspace
        </div>
      </div>
    );
  }

  return (
    <QueriesPausedContext.Provider value={signingOut}>
      <div className="flex min-h-dvh flex-col">
        <Header
          signingOut={signingOut}
          labelOverride={frozenLabel}
          onSignOut={(label) => {
            setFrozenLabel(label);
            setSigningOut(true);
          }}
        />
        <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </QueriesPausedContext.Provider>
  );
}

function Header({
  signingOut,
  labelOverride,
  onSignOut,
}: {
  signingOut: boolean;
  labelOverride: string | null;
  onSignOut: (label: string) => void;
}) {
  const { user } = useSession();
  const label = labelOverride ?? userLabel(user);
  return (
    <header className="border-b border-border bg-background">
      <nav className="mx-auto flex h-[60px] max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <Link href="/dashboard" aria-label="Dashboard" className="flex items-center">
          <GumLogo />
        </Link>
        <div className="flex items-center gap-4 text-[14px] whitespace-nowrap text-muted-foreground sm:gap-5">
          <PricingDialog appearance="light" triggerClassName="transition-colors hover:text-foreground" />
          <a href={links.docs} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-foreground">
            Docs
          </a>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <span className="hidden max-w-[220px] truncate text-foreground sm:inline" title={label}>
            {label}
          </span>
          <SignOut busy={signingOut} onStart={() => onSignOut(label)} />
        </div>
      </nav>
    </header>
  );
}

function SignOut({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const signedOut = React.useRef(false);
  const { logout } = useLogout({
    onSuccess: () => {
      signedOut.current = true;
      router.replace("/");
    },
  });
  // The account's data is dropped once this has unmounted with the page, not
  // before: clearing while the dashboard is still on screen would blank it.
  React.useEffect(
    () => () => {
      if (signedOut.current) qc.clear();
    },
    [qc],
  );
  // A plain link-style button, so it sits at the same size and weight as Pricing
  // and Docs. While signing out it shows a spinner in place of the icon and waits.
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => {
        onStart();
        void logout();
      }}
      aria-label="Sign out"
      className="inline-flex items-center gap-1.5 rounded-[4px] transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
    >
      {busy ? <Spinner className="size-4" /> : <LogOutIcon aria-hidden="true" className="size-4" />}
      <span className="hidden sm:inline">{busy ? "Signing out" : "Sign out"}</span>
    </button>
  );
}

/** A section's heading, in the reference layout's voice: a short title ending in a period. */
export function SectionHeader({
  title,
  description,
  action,
  level = "h2",
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  level?: "h1" | "h2";
}) {
  const Heading = level;
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Heading
          className={
            level === "h1"
              ? "text-[28px] leading-tight font-semibold tracking-[-0.04em]"
              : "text-[22px] leading-tight font-semibold tracking-[-0.035em]"
          }
        >
          {title}
        </Heading>
        {description && <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionSkeleton({ height = 160 }: { height?: number }) {
  return <Skeleton className="w-full rounded-2xl" style={{ height }} />;
}
