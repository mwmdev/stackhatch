import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderKeyManager } from "@/lib/provider-key";
import type { VaultRepository } from "@/lib/vault/repository";
import { DeviceSettingsPage, type DeviceSettingsServices } from "./page";

const mockSetTheme = vi.fn((theme: string) => {
  mockTheme = theme;
});
let mockTheme = "system";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
}));

describe("DeviceSettingsPage theme integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = "system";
    window.history.replaceState({}, "", "/settings");
  });

  it("writes the selected theme to the device preferences without a network request", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const repository = {
      getDevicePreferencesSnapshot: vi.fn().mockResolvedValue({
        generation: "generation-1",
        preferences: null,
      }),
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
      initialize: vi.fn().mockResolvedValue({
        state: "absent",
        generation: "credentials-1",
      }),
    } as unknown as ProviderKeyManager;
    const services: DeviceSettingsServices = {
      createRepository: () => repository,
      getKeyManager: () => keyManager,
      inspectStorage: vi.fn().mockResolvedValue({
        state: "available",
        usage: 0,
        quota: 1,
        usageRatio: 0,
        persisted: true,
        error: null,
      }),
      requestPersistentStorage: vi.fn(),
      afterRestore: vi.fn(),
      afterClear: vi.fn(),
    };
    const view = render(<DeviceSettingsPage services={services} />);
    await screen.findByRole("heading", { name: "Appearance" });
    view.rerender(<DeviceSettingsPage services={services} />);

    fireEvent.click(screen.getByLabelText("Theme dark"));

    await waitFor(() =>
      expect(repository.putDevicePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
        { expectedGeneration: "generation-1", expectedRevision: null }
      )
    );
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
