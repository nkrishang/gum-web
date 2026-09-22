"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLogin } from "@privy-io/react-auth";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { GumLogo } from "@/components/brand/logo";
import { CtaArrow, ctaPrimary } from "@/components/landing/cta";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

/** The landing page's load-time stagger: each piece arrives a beat after the last. */
function delay(index: number): React.CSSProperties {
  return { animationDelay: `${index * 90}ms` };
}

export function LoginCard() {
  const { configured } = useSession();
  return (
    <Card
      // Roomier than the card's default: 24px sides, 56px above the logo.
      className="landing-reveal relative w-full max-w-sm gap-5 shadow-lg shadow-black/5 [--card-spacing:--spacing(6)]"
      style={delay(0)}
    >
      <CardHeader className="items-center gap-1.5 pt-8 text-center">
        <Link href="/" className="landing-reveal mx-auto mb-5 inline-flex" aria-label="Gum home" style={delay(1)}>
          <GumLogo markClassName="size-9" wordmarkClassName="h-6" />
        </Link>
        <CardTitle className="landing-reveal text-lg" style={delay(2)}>
          Sign in to Gum
        </CardTitle>
        <CardDescription className="landing-reveal" style={delay(3)}>
          Manage your API key, webhook and deposits.
        </CardDescription>
      </CardHeader>
      <div className="landing-reveal pt-1 pb-2" style={delay(4)}>
        {configured ? <PrivyLogin /> : <NotConfigured />}
      </div>
      <CardFooter className="landing-reveal justify-center py-5" style={delay(5)}>
        <Button variant="link" size="sm" className="text-muted-foreground" render={<Link href="/" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to gum.money
        </Button>
      </CardFooter>
    </Card>
  );
}

function PrivyLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { ready, authenticated } = useSession();
  const { login } = useLogin({
    onComplete: () => router.replace(next),
  });

  React.useEffect(() => {
    if (ready && authenticated) router.replace(next);
  }, [ready, authenticated, next, router]);

  const busy = !ready || authenticated;
  return (
    <CardContent className="space-y-3">
      {/* The same button as the landing page's hero. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => login()}
        className={cn(ctaPrimary(), "w-full disabled:pointer-events-none disabled:opacity-60")}
      >
        {busy ? <Spinner /> : null}
        {busy ? "One moment" : "Continue with email"}
        {!busy && <CtaArrow />}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        We&rsquo;ll email you a one-time code. No password.
      </p>
    </CardContent>
  );
}

function NotConfigured() {
  return (
    <CardContent>
      <Alert>
        <LockIcon />
        <AlertTitle>Sign-in is not configured</AlertTitle>
        <AlertDescription>
          Set <code className="font-mono text-xs">NEXT_PUBLIC_PRIVY_APP_ID</code> in{" "}
          <code className="font-mono text-xs">.env.local</code> and restart the dev server.
        </AlertDescription>
      </Alert>
    </CardContent>
  );
}
