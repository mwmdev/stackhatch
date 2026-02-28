"use client";

import { ThemeProvider } from "next-themes";
import DevRoleSwitcher from "@/components/DevRoleSwitcher";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      {process.env.NODE_ENV === "development" && <DevRoleSwitcher />}
    </ThemeProvider>
  );
}
