"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth";
import { ArrowRightIcon } from "./icons";
import { DOCS_HREF } from "./links";
import { PricingDialog } from "./pricing-dialog";

/**
 * The landing page's header: the wordmark on the left; Pricing, Docs and the
 * way in on the right, on a rule. The last item knows the visitor: a
 * signed-in user is offered the dashboard, anyone else is offered sign-in.
 */
export function SiteHeader({
  home = "/",
  tone = "light",
  reveal = false,
}: {
  home?: string;
  /** The ground it sits on. */
  tone?: "light" | "dark";
  /** The landing page's load animation. */
  reveal?: boolean;
}) {
  const dark = tone === "dark";
  const { ready, authenticated } = useSession();
  const signedIn = ready && authenticated;
  return (
    <header
      className={cn(
        "relative z-40 border-b",
        dark ? "border-gum-white/10" : "border-gum-grey/30",
        reveal && "landing-reveal",
      )}
    >
      <nav className="mx-auto flex h-[60px] max-w-[1360px] items-center justify-between px-4 sm:h-[72px] sm:px-10">
        <Link href={home} aria-label="Gum" className="rounded-[4px]">
          <Image
            src={dark ? "/gum/logo-on-dark.svg" : "/gum/logo.svg"}
            width={1280}
            height={465}
            priority
            sizes="100px"
            alt="Gum"
            className="h-auto w-[66px] sm:w-[84px]"
          />
        </Link>

        <div
          className={cn(
            "flex items-center gap-4 text-[14px] whitespace-nowrap sm:gap-6 sm:text-[15px]",
            dark ? "text-gum-white/60" : "text-gum-grey",
          )}
        >
          <PricingDialog appearance={tone} />
          <a
            href={DOCS_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("transition-colors", dark ? "hover:text-gum-white" : "hover:text-gum-black")}
          >
            Docs
          </a>
          <Link
            href={signedIn ? "/dashboard" : "/login"}
            // Outlined, in the nav's own grey: the hero's black button is the
            // one call to action above the fold, and this should not compete.
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[14px] font-medium transition-colors [&>svg]:size-4",
              dark
                ? "border-gum-white/25 text-gum-white/80 hover:border-gum-white hover:text-gum-white"
                : "border-gum-grey/40 text-gum-black hover:border-gum-black hover:bg-gum-black/[0.04]",
            )}
          >
            {signedIn ? "Dashboard" : "Sign in"}
            <ArrowRightIcon />
          </Link>
        </div>
      </nav>
    </header>
  );
}
