import type { Metadata } from "next";
import { Alegreya_Sans, Atkinson_Hyperlegible, Kalam } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const bodyFont = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
});

const displayFont = Alegreya_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
});

const noteFont = Kalam({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-note",
});

export const metadata: Metadata = {
  title: "StackHatch - Architecture Maps for Product Teams",
  description:
    "Turn repositories and product briefs into architecture diagrams, tradeoff notes, and shareable engineering handoffs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${noteFont.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
