import type { Metadata } from "next";
import { Archivo, Atkinson_Hyperlegible, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://stackhatch.io";

const bodyFont = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
});

const displayFont = Archivo({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
});

const utilityFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-utility",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "StackHatch",
  title: {
    default: "StackHatch — Keep your architecture in view",
    template: "%s — StackHatch",
  },
  description:
    "A private, local-first architecture workspace. Maps stay in your browser; AI requests go directly to providers only when you ask.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "StackHatch",
    title: "Keep your architecture in view",
    description:
      "A private, local-first architecture workspace. Maps stay in your browser; AI requests go directly to providers only when you ask.",
    images: [
      {
        url: "/screenshots/architecture-overview-og.png",
        width: 1200,
        height: 630,
        alt: "Synthetic Customer Portal reference architecture in the real StackHatch editor",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Keep your architecture in view",
    description:
      "A private, local-first architecture workspace. Maps stay in your browser; AI requests go directly to providers only when you ask.",
    images: ["/screenshots/architecture-overview-og.png"],
  },
  robots: { index: true, follow: true },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "StackHatch",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: siteUrl,
  description:
    "A private, local-first architecture workspace. Maps stay in your browser; AI requests go directly to providers only when you ask.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Organization",
    name: "StackHatch",
    url: siteUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${utilityFont.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
