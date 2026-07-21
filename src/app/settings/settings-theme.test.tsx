import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("SettingsPage theme integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.className = "";
    window.history.replaceState({}, "", "/settings");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("lets the header control advance the theme without reloading account settings", async () => {
    let settingsLoads = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/me") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ name: "Admin User", role: "admin" }),
        });
      }
      if (url === "/api/settings" && !options?.method) {
        settingsLoads += 1;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ hasAnthropicKey: false, theme: "system" }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    }) as unknown as typeof fetch;

    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <SettingsPage />
      </ThemeProvider>
    );

    await screen.findByRole("heading", { name: "Appearance" });
    expect(screen.getByLabelText("Theme system")).toHaveAttribute("aria-pressed", "true");

    const headerToggle = screen.getByRole("button", { name: "Theme: change appearance" });
    fireEvent.click(headerToggle);

    await waitFor(() => {
      expect(screen.getByLabelText("Theme light")).toHaveAttribute("aria-pressed", "true");
    });

    fireEvent.click(headerToggle);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
      expect(screen.getByLabelText("Theme dark")).toHaveAttribute("aria-pressed", "true");
    });
    expect(settingsLoads).toBe(1);
  });
});
