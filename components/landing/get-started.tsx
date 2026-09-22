"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth";
import { CtaArrow, ctaPrimary } from "./cta";

/**
 * The landing page's call to action. Sign-in is Privy's modal on /login, so
 * this is a link rather than the source project's inline email dialog; someone
 * still holding a session goes straight to the dashboard.
 */
export function GetStarted({
  label = "Get Started",
  tone = "black",
}: {
  label?: string;
  /** Black on the page's ground; white where it stands on pink. */
  tone?: "black" | "white";
} = {}) {
  const { ready, authenticated } = useSession();
  const href = ready && authenticated ? "/dashboard" : "/login";
  return (
    <Link href={href} className={ctaPrimary(tone)}>
      {label}
      <CtaArrow />
    </Link>
  );
}
