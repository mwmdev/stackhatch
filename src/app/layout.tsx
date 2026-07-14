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
    default: "StackHatch — See how your codebase fits together",
    template: "%s — StackHatch",
  },
  description:
    "Turn a public GitHub repository into a visual architecture map. Inspect the pieces, ask questions, compare alternatives, and re-scan as the code changes.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "StackHatch",
    title: "See how your codebase fits together",
    description:
      "Map a public GitHub repository, inspect its architecture, ask questions, and compare alternatives.",
    images: [
      {
        url: "/demos/stackhatch-self-map-poster.png",
        width: 1200,
        height: 630,
        alt: "The StackHatch codebase shown as an architecture map",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "See how your codebase fits together",
    description: "Turn a public GitHub repository into a visual architecture map.",
    images: ["/demos/stackhatch-self-map-poster.png"],
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
    "A visual architecture mapping tool for public GitHub repositories, with architecture questions and technology alternatives.",
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
