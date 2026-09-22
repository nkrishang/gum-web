import { cn } from "@/lib/utils";

/**
 * The landing page's two buttons. The words never change colour, so they stay
 * legible; under the pointer the pink arrives as a ring, a glow and the icon,
 * and the arrow slides. On the pink close the pair is reversed: white on pink.
 * Both lift a pixel on hover and settle on press.
 */

const base =
  "group/cta inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-[10px] font-medium " +
  "transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out " +
  "hover:-translate-y-px active:translate-y-0 active:duration-75";

const size = "h-11 px-4 text-[15px] sm:h-12 sm:px-5 sm:text-[16px]";

export function ctaPrimary(tone: "black" | "white" = "black"): string {
  return cn(
    base,
    size,
    tone === "black"
      ? "bg-gum-black text-gum-white shadow-[0_4px_14px_-8px_rgb(18_18_18/0.45)] hover:shadow-[0_0_0_2px_#ff5ca8,0_8px_20px_-10px_rgb(255_92_168/0.45)]"
      : "bg-gum-white text-gum-black shadow-[0_4px_14px_-8px_rgb(18_18_18/0.25)] hover:shadow-[0_0_0_2px_#121212,0_8px_20px_-10px_rgb(18_18_18/0.35)]",
  );
}

export function ctaSecondary(tone: "black" | "white" = "black"): string {
  return cn(
    base,
    size,
    "border",
    tone === "black"
      ? "border-gum-black text-gum-black hover:border-gum-pink hover:bg-gum-pink/10"
      : "border-gum-white text-gum-white hover:bg-gum-white hover:text-gum-black",
  );
}

/** The arrow on the primary: it slides right as the button changes colour. */
export function CtaArrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 transition-[transform,color] duration-200 ease-out group-hover/cta:translate-x-1 group-hover/cta:text-gum-pink"
      fill="none"
    >
      <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The book on the secondary: it tips open a little under the pointer. */
export function CtaBook() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 transition-[transform,color] duration-200 ease-out group-hover/cta:-rotate-6 group-hover/cta:scale-110 group-hover/cta:text-gum-pink"
      fill="none"
    >
      <path
        d="M12 6.5c-1.6-1.4-3.6-2-6-2H4v13h2c2.4 0 4.4.6 6 2 1.6-1.4 3.6-2 6-2h2v-13h-2c-2.4 0-4.4.6-6 2Zm0 0v13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
