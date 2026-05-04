import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsPage from "./page";

const mockSetTheme = vi.fn();
let mockTheme = "light";

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

function mockFetchSettings(settings: Record<string, unknown>) {
  global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/settings" && (!options || options.method !== "PATCH")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(settings),
      });
    }
    if (url === "/api/settings" && options?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ ...settings, ...(JSON.parse(options.body as string) as object) }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as unknown as typeof global.fetch;
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = "light";
  });

  it("renders server-managed settings sections", async () => {
    mockFetchSettings({ hasAnthropicKey: false, role: "free-user", isAdmin: false });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Anthropic API Key")).toBeInTheDocument();
    });

    expect(screen.getByText("Claude Model")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Node Subtypes")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetchSettings({});
    render(<SettingsPage />);
    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("shows back to dashboard link", async () => {
    mockFetchSettings({ hasAnthropicKey: false });
    render(<SettingsPage />);

    await screen.findByText("Anthropic API Key");
    expect(screen.getByText(/Back to Dashboard/).closest("a")).toHaveAttribute("href", "/");
  });

  it("shows server key status", async () => {
    mockFetchSettings({ hasAnthropicKey: true });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("key-status-set")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
  });

  it("loads and displays current model selection", async () => {
    mockFetchSettings({ model: "claude-opus-4-20250514", isAdmin: false });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Claude Model")).toHaveValue("claude-opus-4-20250514");
    });
  });

  it("allows admins to save model selection", async () => {
    mockFetchSettings({
      model: "claude-sonnet-4-20250514",
      role: "admin",
      isAdmin: true,
    });
    render(<SettingsPage />);

    await screen.findByText("Anthropic API Key");
    fireEvent.change(screen.getByLabelText("Claude Model"), {
      target: { value: "claude-haiku-235-20241022" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(screen.getByTestId("toast")).toHaveTextContent("Model preference saved");
    });
  });

  it("renders theme buttons and highlights current theme", async () => {
    mockTheme = "dark";
    mockFetchSettings({});
    render(<SettingsPage />);

    await screen.findByText("Theme");
    expect(screen.getByLabelText("Theme dark")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Theme light")).toHaveAttribute("aria-pressed", "false");
  });

  it("persists theme change to API", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await screen.findByText("Theme");
    fireEvent.click(screen.getByLabelText("Theme system"));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const themeCall = calls.find(
        (call: unknown[]) =>
          (call[1] as RequestInit)?.method === "PATCH" &&
          JSON.parse((call[1] as RequestInit).body as string).theme === "system"
      );
      expect(themeCall).toBeTruthy();
    });
  });
});
