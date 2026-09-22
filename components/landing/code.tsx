import Image from "next/image";
import { cn } from "@/lib/utils";

/** The marks of a currency and a chain, for the landing page's pictures. */

export function Usdc({ className }: { className?: string }) {
  return (
    <Image
      src="/payment-icons/usdc.svg"
      width={64}
      height={64}
      loading="eager"
      alt=""
      className={cn("shrink-0 rounded-full", className)}
    />
  );
}

export function Monad({ className }: { className?: string }) {
  return (
    <Image
      src="/payment-icons/monad.svg"
      width={64}
      height={64}
      loading="eager"
      alt=""
      className={cn("shrink-0", className)}
    />
  );
}
