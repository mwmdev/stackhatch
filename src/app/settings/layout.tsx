import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: true } };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
