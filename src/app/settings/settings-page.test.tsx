import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsPage from "./page";

const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }));
const mockSetTheme = vi.fn();
let mockTheme = "light";

vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

vi.mock("@/lib/analytics", () => ({ trackEvent: mockTrackEvent }));

function mockFetchSettings(settings: Record<string, unknown>) {
  global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/me") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "Settings User",
          }),
      });
    }
    if (url === "/api/settings" && (!options || options.method !== "PATCH")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(settings),
      });
    }
    if (url === "/api/settings" && options?.method === "PATCH") {
      const update = JSON.parse(options.body as string) as Record<string, unknown>;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ...settings,
            ...update,
            ...(update.apiKey ? { hasAnthropicKey: true } : {}),
          }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  }) as unknown as typeof global.fetch;
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = "light";
    mockTrackEvent.mockClear();
    window.history.replaceState({}, "", "/settings");
  });

  it("renders per-user BYOK, model, and theme settings", async () => {
    mockFetchSettings({ hasAnthropicKey: false });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Anthropic API Key")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Default model" })).toBeInTheDocument();
    const sectionNavigation = screen.getByRole("navigation", { name: "Settings sections" });
    expect(sectionNavigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "API key" })).toHaveAttribute("href", "#anthropic-key");
    expect(screen.getByRole("link", { name: "Default model" })).toHaveAttribute(
      "href",
      "#default-model"
    );
    expect(screen.getByRole("link", { name: "Appearance" })).toHaveAttribute("href", "#appearance");
    expect(screen.getByRole("link", { name: "Node subtypes" })).toHaveAttribute(
      "href",
      "#node-subtypes"
    );
    expect(screen.getByRole("heading", { name: "Node subtypes" })).toBeInTheDocument();
    expect(screen.queryByText("AI Prompts")).not.toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1, name: "Settings" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "New map" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All Maps" })).toHaveAttribute("href", "/app/maps");
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("group", { name: "Account controls" })).toBeInTheDocument();
    expect(screen.getByTestId("settings-content")).toHaveClass("min-w-0");
    expect(screen.getByTestId("settings-content")).not.toHaveClass("max-w-3xl");
  });

  it("shows loading state initially", () => {
    mockFetchSettings({});
    render(<SettingsPage />);
    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("shows a named contextual control back to the safe setup return path", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drequirements"
    );
    mockFetchSettings({ hasAnthropicKey: false });
    render(<SettingsPage />);

    await screen.findByText("Anthropic API Key");
    expect(screen.getByRole("link", { name: "Back to map setup" })).toHaveAttribute(
      "href",
      "/project/new?mode=requirements"
    );
    expect(screen.getByRole("tooltip", { name: "Back to map setup" })).toBeInTheDocument();
  });

  it("shows BYOK key status", async () => {
    mockFetchSettings({ hasAnthropicKey: true, hasUserAnthropicKey: true });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("key-status-set")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("API Key")).toBeInTheDocument();
  });

  it("persists the selected Claude model", async () => {
    mockFetchSettings({ model: "claude-sonnet-5" });
    render(<SettingsPage />);

    const model = await screen.findByLabelText("Model");
    fireEvent.change(model, { target: { value: "claude-opus-4-8" } });

    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (item: unknown[]) =>
          (item[1] as RequestInit)?.method === "PATCH" &&
          JSON.parse((item[1] as RequestInit).body as string).model
      );
      expect(call).toBeTruthy();
    });
  });

  it("renders theme buttons and highlights current theme", async () => {
    mockTheme = "dark";
    mockFetchSettings({});
    render(<SettingsPage />);

    await screen.findByRole("heading", { name: "Appearance" });
    expect(screen.getByLabelText("Theme dark")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Theme light")).toHaveAttribute("aria-pressed", "false");
  });

  it("persists theme change to API", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await screen.findByRole("heading", { name: "Appearance" });
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

  it("preserves repository context through BYOK setup", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drepository%26repo%3Dacme%252Fapi%26returnTo%3D%252Fproject%252Fmap-1"
    );
    mockFetchSettings({ hasAnthropicKey: true });
    render(<SettingsPage />);

    const continueLink = await screen.findByRole("link", { name: "Continue to acme/api" });
    expect(continueLink).toHaveAttribute(
      "href",
      "/project/new?mode=repository&repo=acme%2Fapi&returnTo=%2Fproject%2Fmap-1"
    );
    expect(screen.getByText("Connect Anthropic to map this repository.")).toBeInTheDocument();
  });

  it("reveals the continue action after a key is saved", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drepository%26repo%3Dacme%252Fapi"
    );
    mockFetchSettings({ hasAnthropicKey: false });
    render(<SettingsPage />);

    await screen.findByTestId("key-status-missing");
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-ant-test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));

    expect(await screen.findByRole("link", { name: "Continue to acme/api" })).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenNthCalledWith(1, "anthropic_setup_started", {
      location: "settings",
    });
    expect(mockTrackEvent).toHaveBeenNthCalledWith(2, "anthropic_setup_completed", {
      location: "settings",
    });
  });

  it("returns requirements setup to its exact internal mode", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drequirements"
    );
    mockFetchSettings({ hasAnthropicKey: true });
    render(<SettingsPage />);

    expect(
      await screen.findByText("Connect Anthropic to map your requirements.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue to your project" })).toHaveAttribute(
      "href",
      "/project/new?mode=requirements"
    );
  });

  it("rejects external setup return paths", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=anthropic&returnTo=https%3A%2F%2Fevil.example%2Fsteal"
    );
    mockFetchSettings({ hasAnthropicKey: true });
    render(<SettingsPage />);

    expect(await screen.findByRole("link", { name: "Continue to your project" })).toHaveAttribute(
      "href",
      "/app"
    );
    expect(screen.getByRole("link", { name: "Back to map setup" })).toHaveAttribute("href", "/app");
  });

  it("strips an unsafe nested project return while preserving the creation source", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=anthropic&returnTo=%2Fproject%2Fnew%3Fmode%3Drepository%26repo%3Dacme%252Fapi%26returnTo%3Dhttps%253A%252F%252Fevil.example%252Fsteal"
    );
    mockFetchSettings({ hasAnthropicKey: true });
    render(<SettingsPage />);

    expect(await screen.findByRole("link", { name: "Continue to acme/api" })).toHaveAttribute(
      "href",
      "/project/new?mode=repository&repo=acme%2Fapi"
    );
  });

  it("canonicalizes the legacy repository setup parameter", async () => {
    window.history.replaceState({}, "", "/settings?setup=anthropic&repo=acme%2Fapi");
    mockFetchSettings({ hasAnthropicKey: true });
    render(<SettingsPage />);

    expect(await screen.findByRole("link", { name: "Continue to acme/api" })).toHaveAttribute(
      "href",
      "/project/new?mode=repository&repo=acme%2Fapi"
    );
  });
});
