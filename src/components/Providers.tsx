"use client";

import { ThemeProvider } from "next-themes";
import AutomaticStoragePersistence from "@/components/AutomaticStoragePersistence";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AutomaticStoragePersistence />
      {children}
    </ThemeProvider>
  );
}
