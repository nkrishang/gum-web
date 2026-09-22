"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The scaffolding under the animated pictures on the landing page: a
 * fixed-size composition that scales to whatever it is given, so it never
 * reflows on a phone.
 */

/**
 * Whether an element is on screen. Off screen, its loop stops: a phone
 * scrolling past a picture should not be re-rendering it thirty times a
 * second underneath the scroll.
 */
export function useInView(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? true),
      { threshold: 0.05 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

/**
 * A composition laid out at its own size and scaled to the frame. By default
 * the frame takes the composition's aspect ratio and the picture fills its
 * width; with `fit="contain"` the frame is whatever box it is given and the
 * picture is scaled to sit inside it, centred, so a row of panels can share
 * one height. Until the first measurement has been applied it stays
 * invisible, so the first paint on a phone never shows it at full size for a
 * frame before it snaps down; it fades in at the right size instead.
 */
export function Stage({
  width,
  height,
  label,
  fit = "width",
  className,
  children,
}: {
  width: number;
  height: number;
  label: string;
  fit?: "width" | "contain";
  className?: string;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // A ResizeObserver reports once on observe, so the first measurement
    // arrives through the same callback as every later one.
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      setScale(fit === "contain" ? Math.min(w / width, h / height) : w / width);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [width, height, fit]);

  const picture = (
    <div
      className={cn(
        "absolute top-0 left-0 origin-top-left",
        scale === null ? "invisible" : "landing-stage-fade-in",
      )}
      style={{ width, height, transform: `scale(${scale ?? 1})` }}
    >
      {children}
    </div>
  );

  if (fit === "contain") {
    // The measuring frame is the box; the picture's own frame is sized to the
    // scaled composition and centred, so its corners and ground stay its own.
    return (
      <div ref={frameRef} role="img" aria-label={label} className="flex h-full w-full items-center justify-center">
        <div
          className={cn("relative overflow-hidden", className)}
          style={{ width: width * (scale ?? 1), height: height * (scale ?? 1) }}
        >
          {picture}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={label}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {picture}
    </div>
  );
}
