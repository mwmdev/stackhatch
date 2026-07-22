"use client";

import { ThemeProvider } from "next-themes";
import AnalyticsProvider from "@/components/AnalyticsProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AnalyticsProvider />
      {children}
    </ThemeProvider>
  );
}
