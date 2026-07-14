"use client";

import { ThemeProvider } from "next-themes";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import AnalyticsProvider from "@/components/AnalyticsProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AnalyticsProvider />
      <ImpersonationBanner />
      {children}
    </ThemeProvider>
  );
}
