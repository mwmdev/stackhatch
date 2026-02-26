import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shastack",
  description: "Visual Application Architecture Brainstorming Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
