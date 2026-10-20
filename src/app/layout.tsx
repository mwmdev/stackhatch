import type { Metadata } from "next";
import { Archivo, Atkinson_Hyperlegible_Next, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import SkipLink from "@/components/shells/SkipLink";
import { SITE_URL, shareMetadata } from "@/lib/site-metadata";
import "./globals.css";

const SITE_DESCRIPTION =
  "Turn GitHub repositories, public or private, and Markdown requirements into editable architecture maps. Local-first, accountless, and open source.";

// The UI asks for weights between 400 and 800. Any weight a family does not
// ship gets synthesised by the browser into a smeared faux-bold, which is
// exactly what the legibility-first body face is meant to avoid. Atkinson
// Hyperlegible ships only 400 and 700, so the body face is its variable
// successor; Archivo and Plex Mono cover the range directly.
const bodyFont = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-body",
  fallback: ["system-ui", "sans-serif"],
});

// Archivo's width axis carries the hierarchy: condensed (wdth 62–85) for
// titles, wide (112) for controls. With `axes`, the generated @font-face
// declares the 62–125% stretch range, so `font-stretch` selects the width.
const displayFont = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-display",
});

const utilityFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-utility",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "StackHatch",
  title: {
    default: "StackHatch — Keep your architecture in view",
    template: "%s — StackHatch",
  },
  description: SITE_DESCRIPTION,
  ...shareMetadata("Keep your architecture in view", SITE_DESCRIPTION),
  robots: { index: true, follow: true },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "StackHatch",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Organization",
    name: "StackHatch",
    url: SITE_URL,
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
        {/* Every route puts navigation ahead of the content. */}
        <SkipLink />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
