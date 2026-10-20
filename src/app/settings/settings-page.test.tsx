import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AiProviderId } from "@/lib/ai/providers";
import type { ProviderKeyManager, ProviderKeyStatus } from "@/lib/provider-key";
import type { VaultDevicePreferencesSnapshot, VaultRepository } from "@/lib/vault/repository";
import type { VaultStorageStatus } from "@/lib/vault/storage-status";
import { DeviceSettingsPage, type DeviceSettingsServices } from "./page";

const mockSetTheme = vi.fn();
let mockTheme = "light";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

const emptySnapshot: VaultDevicePreferencesSnapshot = {
  generation: "generation-1",
  preferences: null,
};

const storageStatus: VaultStorageStatus = {
  state: "available",
  usage: 1_024,
  quota: 10_240,
  usageRatio: 0.1,
  persisted: false,
  error: null,
};

function makeServices(
  options: {
    snapshot?: VaultDevicePreferencesSnapshot;
    readError?: Error;
    initialKey?: Omit<ProviderKeyStatus, "provider">;
  } = {}
) {
  const statuses: Partial<Record<AiProviderId, ProviderKeyStatus>> = {
    anthropic: {
      provider: "anthropic",
      state: options.initialKey?.state ?? "absent",
      generation: options.initialKey?.generation ?? "credential-generation-1",
    },
  };
  const statusFor = (provider: AiProviderId): ProviderKeyStatus =>
    statuses[provider] ?? { provider, state: "absent", generation: "credential-generation-1" };
  const repository = {
    getDevicePreferencesSnapshot: options.readError
      ? vi.fn().mockRejectedValue(options.readError)
      : vi.fn().mockResolvedValue(options.snapshot ?? emptySnapshot),
    putDevicePreferences: vi.fn(async (values) => ({
      id: "device",
      ...values,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })),
    close: vi.fn(),
  } as unknown as VaultRepository;
  const keyManager = {
    getStatus: vi.fn(async (provider: AiProviderId) => statusFor(provider)),
    useSessionKey: vi.fn(async (provider: AiProviderId) => {
      statuses[provider] = { ...statusFor(provider), state: "session" };
      return statusFor(provider);
    }),
    rememberKey: vi.fn(async (provider: AiProviderId) => {
      statuses[provider] = { ...statusFor(provider), state: "remembered" };
      return statusFor(provider);
    }),
    forgetKey: vi.fn(async (provider: AiProviderId) => {
      statuses[provider] = {
        provider,
        state: "absent",
        generation: "credential-generation-2",
      };
      return statusFor(provider);
    }),
    forgetAllKeys: vi.fn(),
    getKeyForDispatch: vi.fn(),
    close: vi.fn(),
  } as unknown as ProviderKeyManager;
  const services: DeviceSettingsServices = {
    createRepository: vi.fn(() => repository),
    getKeyManager: vi.fn(() => keyManager),
    inspectStorage: vi.fn().mockResolvedValue(storageStatus),
    afterClear: vi.fn(),
  };
  return { services, repository, keyManager };
}

describe("DeviceSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = "light";
    window.history.replaceState({}, "", "/settings");
  });

  it("renders device-owned settings without account, analytics, or server reads", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { services } = makeServices();
    render(<DeviceSettingsPage services={services} />);

    expect(screen.getByText("Opening settings from this device...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Anthropic key" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Device data" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Device data" })).toHaveAttribute(
      "href",
      "#device-data"
    );
    expect(screen.getByRole("button", { name: "Back up all maps" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all local data" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ask browser to keep data" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps a session key out of React state and visibly distinguishes its lifecycle", async () => {
    const { services, keyManager } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    await screen.findByTestId("key-status-absent");

    const input = screen.getByLabelText("Anthropic API key");
    fireEvent.change(input, { target: { value: "sk-ant-session" } });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));

    expect(await screen.findByTestId("key-status-session")).toHaveTextContent("This session only");
    expect(input).toHaveValue("");
    expect(keyManager.useSessionKey).toHaveBeenCalledWith("anthropic", "sk-ant-session");
    expect(keyManager.rememberKey).not.toHaveBeenCalled();
  });

  it("rejects an invalid key shape without saving or exposing it", async () => {
    const { services, keyManager } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    await screen.findByTestId("key-status-absent");
    fireEvent.change(screen.getByLabelText("Anthropic API key"), {
      target: { value: "hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    expect(screen.getByRole("alert")).toHaveTextContent("It starts with sk-ant-");
    expect(screen.getByTestId("key-status-absent")).toBeInTheDocument();
    expect(keyManager.useSessionKey).not.toHaveBeenCalled();
    expect(keyManager.rememberKey).not.toHaveBeenCalled();
  });

  it("remembers only after explicit opt-in and forgets active plus durable state", async () => {
    const { services, keyManager } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    await screen.findByTestId("key-status-absent");

    const keyRow = within(screen.getByRole("region", { name: "Anthropic key" }));
    fireEvent.change(keyRow.getByLabelText("Anthropic API key"), {
      target: { value: "sk-ant-remember" },
    });
    fireEvent.click(keyRow.getByRole("checkbox"));
    fireEvent.click(keyRow.getByRole("button", { name: "Use key" }));

    expect(await screen.findByTestId("key-status-remembered")).toHaveTextContent(
      "Remembered on device"
    );
    expect(
      keyRow.getByText(/extensions, same-origin scripts and anyone using/i)
    ).toBeInTheDocument();
    expect(keyManager.rememberKey).toHaveBeenCalledWith("anthropic", "sk-ant-remember");

    fireEvent.click(screen.getByRole("button", { name: "Forget key" }));
    expect(await screen.findByTestId("key-status-absent")).toBeInTheDocument();
    expect(keyManager.forgetKey).toHaveBeenCalledWith("anthropic");
  });

  it("keeps the GitHub token apart from the AI key and accepts only fine-grained tokens", async () => {
    const { services, keyManager } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    const row = within(await screen.findByRole("region", { name: "GitHub token" }));
    expect(await row.findByTestId("github-token-status-absent")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Create a read-only GitHub token" })).toHaveAttribute(
      "href",
      expect.stringContaining("contents=read")
    );

    fireEvent.change(row.getByLabelText("GitHub token"), { target: { value: "ghp_classic" } });
    fireEvent.click(row.getByRole("button", { name: "Use token" }));
    expect(row.getByRole("alert")).toHaveTextContent(/only accepts fine-grained tokens/);
    expect(keyManager.useSessionKey).not.toHaveBeenCalled();

    fireEvent.change(row.getByLabelText("GitHub token"), {
      target: { value: "github_pat_remembered" },
    });
    fireEvent.click(row.getByRole("checkbox"));
    fireEvent.click(row.getByRole("button", { name: "Use token" }));
    expect(await row.findByTestId("github-token-status-remembered")).toBeInTheDocument();
    expect(keyManager.rememberKey).toHaveBeenCalledWith("github", "github_pat_remembered");
    expect(screen.getByTestId("key-status-absent")).toBeInTheDocument();

    fireEvent.click(row.getByRole("button", { name: "Forget token" }));
    expect(await row.findByTestId("github-token-status-absent")).toBeInTheDocument();
    expect(keyManager.forgetKey).toHaveBeenCalledWith("github");
  });

  it("stores model preferences in the browser vault", async () => {
    const { services, repository } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    const model = await screen.findByLabelText("Model");

    fireEvent.change(model, { target: { value: "claude-opus-4-8" } });

    await waitFor(() =>
      expect(repository.putDevicePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ model: "anthropic:claude-opus-4-8" }),
        { expectedGeneration: "generation-1", expectedRevision: null }
      )
    );
  });

  it("switches provider, persists its default model and targets its key", async () => {
    const { services, repository, keyManager } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    await screen.findByTestId("key-status-absent");

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } });

    await waitFor(() =>
      expect(repository.putDevicePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ model: "openai:gpt-6.1-sol" }),
        { expectedGeneration: "generation-1", expectedRevision: null }
      )
    );
    expect(await screen.findByRole("heading", { name: "OpenAI key" })).toBeInTheDocument();
    expect(keyManager.getStatus).toHaveBeenLastCalledWith("openai");

    fireEvent.change(screen.getByLabelText("OpenAI API key"), {
      target: { value: "sk-openai-test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));
    expect(await screen.findByTestId("key-status-session")).toBeInTheDocument();
    expect(keyManager.useSessionKey).toHaveBeenCalledWith("openai", "sk-openai-test");
  });

  it("saves a custom OpenRouter model id and rejects ids with spaces", async () => {
    const { services, repository } = makeServices({
      snapshot: {
        generation: "generation-1",
        preferences: {
          id: "device",
          model: "openrouter:deepseek/deepseek-v4-pro",
          theme: "system",
          customSubtypes: {},
          editorDisplay: {},
          revision: 1,
          createdAt: 1,
          updatedAt: 1,
        } as never,
      },
    });
    render(<DeviceSettingsPage services={services} />);
    fireEvent.change(await screen.findByLabelText("Model"), { target: { value: "__other__" } });

    const modelId = await screen.findByLabelText("Model ID");
    fireEvent.change(modelId, { target: { value: "acme/some model" } });
    fireEvent.click(screen.getByRole("button", { name: "Save model" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(repository.putDevicePreferences).not.toHaveBeenCalled();

    fireEvent.change(modelId, { target: { value: "acme/custom-model" } });
    fireEvent.click(screen.getByRole("button", { name: "Save model" }));
    await waitFor(() =>
      expect(repository.putDevicePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ model: "openrouter:acme/custom-model" }),
        expect.anything()
      )
    );
  });

  it("keeps the Model ID field and typed value when saving a custom model fails", async () => {
    const { services, repository } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    fireEvent.change(await screen.findByLabelText("Model"), { target: { value: "__other__" } });
    vi.mocked(repository.putDevicePreferences).mockRejectedValueOnce(new Error("quota"));

    const modelId = await screen.findByLabelText("Model ID");
    fireEvent.change(modelId, { target: { value: "acme/custom-model" } });
    fireEvent.click(screen.getByRole("button", { name: "Save model" }));

    expect(await screen.findByText("quota")).toBeInTheDocument();
    expect(screen.getByLabelText("Model ID")).toHaveValue("acme/custom-model");
  });

  it("scrolls a deep-linked section into view once the settings have loaded", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState({}, "", "/settings#api-key");
    render(<DeviceSettingsPage services={makeServices().services} />);

    await screen.findByLabelText("Anthropic API key");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.contexts[0]).toHaveProperty("id", "api-key");
    expect(screen.getByRole("link", { name: "API key" })).toHaveAttribute("aria-current", "true");
  });

  it("treats a failing key-status read after a saved switch as no key, not a failed switch", async () => {
    const { services, keyManager } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    await screen.findByTestId("key-status-absent");
    vi.mocked(keyManager.getStatus).mockRejectedValueOnce(new Error("idb"));

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "openai" } });

    expect((await screen.findAllByText(/OpenAI selected on this device\./)).length).toBeGreaterThan(
      0
    );
    expect(screen.getByTestId("key-status-absent")).toBeInTheDocument();
  });

  it("preserves the exact safe setup return path", async () => {
    const returnTo = "/project/new?mode=repository#repo=acme%2Fapi&returnTo=%2Fproject%2F%23map-1";
    window.history.replaceState(
      {},
      "",
      `/settings?setup=ai&returnTo=${encodeURIComponent(returnTo)}`
    );
    const { services } = makeServices({
      initialKey: { state: "session", generation: "credential-generation-1" },
    });
    render(<DeviceSettingsPage services={services} />);

    expect(await screen.findByRole("link", { name: "Continue to acme/api" })).toHaveAttribute(
      "href",
      "/project/new?mode=repository#repo=acme%2Fapi&returnTo=%2Fproject%2F%23map-1"
    );
    expect(screen.getByRole("link", { name: "Back to map setup" })).toHaveAttribute(
      "href",
      "/project/new?mode=repository#repo=acme%2Fapi&returnTo=%2Fproject%2F%23map-1"
    );
  });

  it("focuses the key input after loading in setup mode", async () => {
    window.history.replaceState({}, "", "/settings?setup=ai");
    render(<DeviceSettingsPage services={makeServices().services} />);
    expect(await screen.findByLabelText("Anthropic API key")).toHaveFocus();
    expect(screen.getByRole("link", { name: "Open Anthropic API key settings" })).toHaveAttribute(
      "href",
      "https://console.anthropic.com/settings/keys"
    );
  });

  it("rejects an external setup return path", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=ai&returnTo=https%3A%2F%2Fevil.example%2Fsteal"
    );
    const { services } = makeServices({
      initialKey: { state: "session", generation: "credential-generation-1" },
    });
    render(<DeviceSettingsPage services={services} />);

    expect(await screen.findByRole("link", { name: "Continue to your project" })).toHaveAttribute(
      "href",
      "/app"
    );
  });

  it("does not mount mutation controls while the browser vault is unavailable", async () => {
    const first = makeServices({ readError: new Error("IndexedDB blocked") });
    render(<DeviceSettingsPage services={first.services} />);

    expect(
      await screen.findByRole("heading", { name: "Browser settings are unavailable" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back up all maps" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry browser storage" })).toBeInTheDocument();
  });
});
