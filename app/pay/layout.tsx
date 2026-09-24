import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Pay", template: "%s · Gum" },
  // A payment link is public, but not something for search engines to keep.
  robots: { index: false, follow: false },
};

export default function PayLayout({ children }: LayoutProps<"/pay">) {
  return children;
}
