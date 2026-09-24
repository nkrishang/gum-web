import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// The dashboard's type.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The landing page's type (`.landing` in globals.css).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains" });

const description =
  "Create a unique programmable address for every deposit. Control who can fund it and where it settles. Let your users pay from any source.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://gum.money"),
  title: {
    default: "Gum — stablecoin deposits that stick.",
    template: "Gum · %s",
  },
  description,
  openGraph: {
    type: "website",
    siteName: "Gum",
    title: "Gum — stablecoin deposits that stick.",
    description,
    url: "https://gum.money",
  },
  twitter: {
    // Large card on X, which reads these tags ahead of the OpenGraph ones.
    card: "summary_large_image",
    site: "@gum_money",
    title: "Gum — stablecoin deposits that stick.",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
