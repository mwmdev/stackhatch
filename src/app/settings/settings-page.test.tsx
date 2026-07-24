import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    initialKey?: ProviderKeyStatus;
  } = {}
) {
  let keyStatus = options.initialKey ?? {
    state: "absent" as const,
    generation: "credential-generation-1",
  };
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
    initialize: vi.fn(async () => keyStatus),
    getStatus: vi.fn(async () => keyStatus),
    useSessionKey: vi.fn(async () => {
      keyStatus = { state: "session", generation: keyStatus.generation };
      return keyStatus;
    }),
    rememberKey: vi.fn(async () => {
      keyStatus = { state: "remembered", generation: keyStatus.generation };
      return keyStatus;
    }),
    forgetKey: vi.fn(async () => {
      keyStatus = { state: "absent", generation: "credential-generation-2" };
      return keyStatus;
    }),
    getKeyForDispatch: vi.fn(),
    close: vi.fn(),
  } as ProviderKeyManager;
  const services: DeviceSettingsServices = {
    createRepository: vi.fn(() => repository),
    getKeyManager: vi.fn(() => keyManager),
    inspectStorage: vi.fn().mockResolvedValue(storageStatus),
    requestPersistentStorage: vi.fn().mockResolvedValue({ ...storageStatus, persisted: true }),
    afterRestore: vi.fn(),
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
    expect(screen.getByRole("button", { name: "Back up all data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all local data" })).toBeInTheDocument();
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
    expect(keyManager.useSessionKey).toHaveBeenCalledWith("sk-ant-session");
    expect(keyManager.rememberKey).not.toHaveBeenCalled();
  });

  it("remembers only after explicit opt-in and forgets active plus durable state", async () => {
    const { services, keyManager } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    await screen.findByTestId("key-status-absent");

    fireEvent.change(screen.getByLabelText("Anthropic API key"), {
      target: { value: "sk-ant-remember" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Use key" }));

    expect(await screen.findByTestId("key-status-remembered")).toHaveTextContent(
      "Remembered on device"
    );
    expect(screen.getByText(/same-origin scripts, browser extensions/i)).toBeInTheDocument();
    expect(keyManager.rememberKey).toHaveBeenCalledWith("sk-ant-remember");

    fireEvent.click(screen.getByRole("button", { name: "Forget key" }));
    expect(await screen.findByTestId("key-status-absent")).toBeInTheDocument();
    expect(keyManager.forgetKey).toHaveBeenCalledTimes(1);
  });

  it("stores model preferences in the browser vault", async () => {
    const { services, repository } = makeServices();
    render(<DeviceSettingsPage services={services} />);
    const model = await screen.findByLabelText("Model");

    fireEvent.change(model, { target: { value: "claude-opus-4-8" } });

    await waitFor(() =>
      expect(repository.putDevicePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-opus-4-8" }),
        { expectedGeneration: "generation-1", expectedRevision: null }
      )
    );
  });

  it("preserves the exact safe setup return path", async () => {
    const returnTo = "/project/new?mode=repository#repo=acme%2Fapi&returnTo=%2Fproject%2F%23map-1";
    window.history.replaceState(
      {},
      "",
      `/settings?setup=anthropic&returnTo=${encodeURIComponent(returnTo)}`
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

  it("rejects an external setup return path", async () => {
    window.history.replaceState(
      {},
      "",
      "/settings?setup=anthropic&returnTo=https%3A%2F%2Fevil.example%2Fsteal"
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
    expect(screen.queryByRole("button", { name: "Back up all data" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry browser storage" })).toBeInTheDocument();
  });
});
