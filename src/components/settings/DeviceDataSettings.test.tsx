import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeviceDataSettings, { CLEAR_DEVICE_CONFIRMATION } from "./DeviceDataSettings";

const { repository, exportVaultBackup } = vi.hoisted(() => ({
  repository: { marker: "browser vault" },
  exportVaultBackup: vi.fn(),
}));
vi.mock("@/lib/vault/repository", () => ({ getBrowserVaultRepository: () => repository }));
vi.mock("@/lib/vault/backup", () => ({ exportVaultBackup }));

const storageStatus = {
  state: "available" as const,
  usage: 2_048,
  quota: 10_240,
  usageRatio: 0.2,
  persisted: false,
  error: null,
};

function renderSettings(overrides: Partial<ComponentProps<typeof DeviceDataSettings>> = {}) {
  const props = {
    storageStatus,
    clearData: vi.fn().mockResolvedValue(undefined),
    onCleared: vi.fn(),
    ...overrides,
  };
  render(<DeviceDataSettings {...props} />);
  return props;
}

describe("DeviceDataSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    exportVaultBackup.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:backup"),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("exports a full-vault backup from Settings using the All maps backup path", async () => {
    exportVaultBackup.mockResolvedValue('{"format":"stackhatch-backup"}');
    renderSettings();
    expect(screen.getByText("Best effort")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back up all maps" }));
    await waitFor(() => expect(exportVaultBackup).toHaveBeenCalledWith(repository));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(screen.getByRole("status")).toHaveTextContent("Provider keys are never included");
    expect(screen.queryByLabelText("Choose StackHatch backup")).not.toBeInTheDocument();
  });

  it("reports a failed export without claiming a backup was downloaded", async () => {
    exportVaultBackup.mockRejectedValue(new Error("Browser vault is locked"));
    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Back up all maps" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Browser vault is locked");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("keeps clearing in Settings and points people to backups on All maps", () => {
    renderSettings();

    expect(
      screen.getByText(/Permanently removes every StackHatch map, message, preference/i)
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear all local data" }));

    expect(screen.getByRole("link", { name: "Open backup and restore" })).toHaveAttribute(
      "href",
      "/app/maps#backups"
    );
  });

  it("requires the exact phrase and reports a blocked tab without false success", async () => {
    let release!: () => void;
    const clearData = vi.fn(
      (onBlocked: (store: "credentials" | "vault") => void) =>
        new Promise<void>((resolve) => {
          onBlocked("vault");
          release = resolve;
        })
    );
    const onCleared = vi.fn();
    renderSettings({ clearData, onCleared });
    fireEvent.click(screen.getByRole("button", { name: "Clear all local data" }));

    const submit = screen.getByRole("button", { name: "Permanently clear this device" });
    fireEvent.change(screen.getByLabelText(new RegExp(CLEAR_DEVICE_CONFIRMATION)), {
      target: { value: CLEAR_DEVICE_CONFIRMATION.toLowerCase() },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(new RegExp(CLEAR_DEVICE_CONFIRMATION)), {
      target: { value: CLEAR_DEVICE_CONFIRMATION },
    });
    fireEvent.click(submit);

    expect(await screen.findByRole("status")).toHaveTextContent("Another StackHatch tab");
    expect(screen.queryByRole("link", { name: "Open backup and restore" })).not.toBeInTheDocument();
    expect(onCleared).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("data was cleared");
    expect(screen.getByRole("link", { name: "Return to StackHatch" })).toHaveAttribute("href", "/");
    const committedDialog = screen.getByRole("dialog");
    fireEvent.keyDown(committedDialog, { key: "Escape" });
    expect(committedDialog).toBeInTheDocument();
  });

  it("closes the confirmation with Escape and restores focus", async () => {
    renderSettings();
    const trigger = screen.getByRole("button", { name: "Clear all local data" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Clear all StackHatch data from this device?",
    });

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
