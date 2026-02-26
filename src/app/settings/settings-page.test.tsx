import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SettingsPage from "./page";

// Mock next-themes
const mockSetTheme = vi.fn();
let mockTheme = "light";
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

function mockFetchSettings(settings: Record<string, string>) {
  global.fetch = vi.fn(
    (input: RequestInfo | URL, options?: RequestInit) => {
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
          json: () => Promise.resolve(settings),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    },
  ) as unknown as typeof global.fetch;
}

function mockFetchSettingsWithPatchFailure(settings: Record<string, string>) {
  global.fetch = vi.fn(
    (input: RequestInfo | URL, options?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/settings" && (!options || options.method !== "PATCH")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(settings),
        });
      }
      if (url === "/api/settings" && options?.method === "PATCH") {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: "Failed" }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    },
  ) as unknown as typeof global.fetch;
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = "light";
  });

  it("renders settings form with all sections", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    expect(screen.getByText("Claude Model")).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetchSettings({});
    render(<SettingsPage />);
    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
  });

  it("shows back to dashboard link", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    const backLink = screen.getByText(/Back to Dashboard/);
    expect(backLink.closest("a")).toHaveAttribute("href", "/");
  });

  it("shows missing status when no API key is set", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("key-status-missing")).toBeInTheDocument();
    });
  });

  it("shows set status when API key exists", async () => {
    mockFetchSettings({ apiKey: "sk-ant-abc123def456" });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("key-status-set")).toBeInTheDocument();
    });
  });

  it("shows validation error for invalid API key format", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("API Key");
    fireEvent.change(input, { target: { value: "invalid-key" } });

    const saveButtons = screen.getAllByText("Save");
    fireEvent.click(saveButtons[0]);

    expect(screen.getByTestId("key-error")).toHaveTextContent(
      "API key must start with sk-ant-",
    );
  });

  it("saves valid API key and shows success toast", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("API Key");
    fireEvent.change(input, { target: { value: "sk-ant-valid123" } });

    const saveButtons = screen.getAllByText("Save");
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("toast")).toHaveTextContent("API key saved");
    });

    // Verify PATCH was called with correct data
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const patchCall = calls.find(
      (c: unknown[]) =>
        (c[1] as RequestInit)?.method === "PATCH" &&
        JSON.parse((c[1] as RequestInit).body as string).apiKey ===
          "sk-ant-valid123",
    );
    expect(patchCall).toBeTruthy();
  });

  it("shows error toast when API key save fails", async () => {
    mockFetchSettingsWithPatchFailure({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    const input = screen.getByLabelText("API Key");
    fireEvent.change(input, { target: { value: "sk-ant-valid123" } });

    const saveButtons = screen.getAllByText("Save");
    fireEvent.click(saveButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("toast")).toHaveTextContent(
        "Failed to save API key",
      );
    });
  });

  it("loads and displays current model selection", async () => {
    mockFetchSettings({ model: "claude-opus-4-20250514" });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Claude Model")).toHaveValue(
        "claude-opus-4-20250514",
      );
    });
  });

  it("saves model selection", async () => {
    mockFetchSettings({ model: "claude-sonnet-4-20250514" });
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    const select = screen.getByLabelText("Claude Model");
    fireEvent.change(select, { target: { value: "claude-haiku-235-20241022" } });

    const saveButtons = screen.getAllByText("Save");
    fireEvent.click(saveButtons[1]); // Model save button

    await waitFor(() => {
      expect(screen.getByTestId("toast")).toHaveTextContent(
        "Model preference saved",
      );
    });
  });

  it("renders theme buttons and highlights current theme", async () => {
    mockTheme = "dark";
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Theme")).toBeInTheDocument();
    });

    const darkButton = screen.getByLabelText("Theme dark");
    expect(darkButton).toHaveAttribute("aria-pressed", "true");

    const lightButton = screen.getByLabelText("Theme light");
    expect(lightButton).toHaveAttribute("aria-pressed", "false");
  });

  it("changes theme on button click", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Theme")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Theme dark"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("persists theme change to API", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Theme")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Theme system"));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const themeCall = calls.find(
        (c: unknown[]) =>
          (c[1] as RequestInit)?.method === "PATCH" &&
          JSON.parse((c[1] as RequestInit).body as string).theme === "system",
      );
      expect(themeCall).toBeTruthy();
    });
  });

  it("has show/hide toggle for API key", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("Show API key")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Show API key"));
    expect(screen.getByLabelText("Hide API key")).toBeInTheDocument();
  });

  it("disables save button when API key is empty", async () => {
    mockFetchSettings({});
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    const saveButtons = screen.getAllByText("Save");
    expect(saveButtons[0]).toBeDisabled();
  });
});
