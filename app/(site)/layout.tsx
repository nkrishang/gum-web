import { Providers } from "@/components/providers";

/**
 * The site: landing page, sign-in and dashboard, with Privy and the dashboard's query client.
 * The pay page lives outside this group so a payer never downloads either.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return <Providers>{children}</Providers>;
}
