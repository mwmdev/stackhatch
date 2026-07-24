import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeviceDataSettings, { CLEAR_DEVICE_CONFIRMATION } from "./DeviceDataSettings";

const storageStatus = {
  state: "available" as const,
  usage: 2_048,
  quota: 10_240,
  usageRatio: 0.2,
  persisted: false,
  error: null,
};

function renderSettings(overrides: Record<string, unknown> = {}) {
  const props = {
    storageStatus,
    requestPersistence: vi.fn().mockResolvedValue({ ...storageStatus, persisted: true }),
    exportBackup: vi.fn().mockResolvedValue('{"format":"stackhatch-backup"}'),
    prepareImport: vi.fn(),
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
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:stackhatch-backup"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("requests durable storage only from an explicit user action", async () => {
    const props = renderSettings();
    expect(props.requestPersistence).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ask browser to keep data" }));

    expect(await screen.findByRole("status")).toHaveTextContent("granted persistent storage");
    expect(props.requestPersistence).toHaveBeenCalledTimes(1);
  });

  it("downloads a full backup and states that credentials are excluded", async () => {
    const props = renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Back up all data" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Provider keys are never included");
    expect(props.exportBackup).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("renders import previews as text and defaults collisions to keep both", async () => {
    const commit = vi.fn().mockResolvedValue("generation-2");
    const prepareImport = vi.fn().mockResolvedValue({
      preview: {
        kind: "project",
        projectCount: 1,
        templateCount: 0,
        projectNames: ['<img src=x onerror="steal()">'],
        templateNames: [],
        conflicts: [{ recordType: "project", id: "project-1", name: "Existing map" }],
        includesDevicePreferences: false,
        includesRecentMap: false,
        deviceStateConflicts: [],
        defaultConflictResolution: "keep-both",
      },
      commit,
    });
    renderSettings({ prepareImport });
    const file = {
      text: vi.fn().mockResolvedValue("validated backup bytes"),
    } as unknown as File;

    fireEvent.change(screen.getByLabelText("Choose StackHatch backup"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("region", { name: "Backup preview" })).toHaveTextContent(
      '<img src=x onerror="steal()">'
    );
    expect(document.querySelector('img[src="x"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText("If an item already exists")).toHaveValue("keep-both");
    fireEvent.click(screen.getByRole("button", { name: "Restore backup" }));
    await waitFor(() =>
      expect(commit).toHaveBeenCalledWith("keep-both", { restoreDeviceState: false })
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
    expect(onCleared).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("data was cleared");
    expect(screen.getByRole("link", { name: "Return to StackHatch" })).toHaveAttribute("href", "/");
    const committedDialog = screen.getByRole("dialog");
    fireEvent.keyDown(committedDialog, { key: "Escape" });
    expect(committedDialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back up before clearing" })).toBeDisabled();
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
