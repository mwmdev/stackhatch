import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BackupRestorePanel from "./BackupRestorePanel";

function renderPanel(overrides: Partial<ComponentProps<typeof BackupRestorePanel>> = {}) {
  const props = {
    exportBackup: vi.fn().mockResolvedValue('{"format":"stackhatch-backup"}'),
    prepareImport: vi.fn(),
    onRestored: vi.fn(),
    ...overrides,
  };
  render(<BackupRestorePanel {...props} />);
  return props;
}

describe("BackupRestorePanel", () => {
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

  it("downloads a full backup and states that credentials are excluded", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Back up all maps" }));

    await waitFor(() =>
      expect(document.querySelector("[aria-live]")).toHaveTextContent(
        "Success: A full StackHatch backup was downloaded."
      )
    );
    expect(props.exportBackup).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("renders import previews as text and defaults collisions to keep both", async () => {
    const commit = vi.fn().mockResolvedValue("generation-2");
    const prepareImport = vi.fn().mockResolvedValue({
      preview: {
        kind: "project",
        projectCount: 1,
        discardedTemplateCount: 0,
        projectNames: ['<img src=x onerror="steal()">'],
        conflicts: [{ recordType: "project", id: "project-1", name: "Existing map" }],
        includesDevicePreferences: false,
        includesRecentMap: false,
        deviceStateConflicts: [],
        defaultConflictResolution: "keep-both",
      },
      commit,
    });
    renderPanel({ prepareImport });
    const file = {
      size: 32,
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

  it("moves focus into the preview and back to the picker on cancel", async () => {
    const prepareImport = vi.fn().mockResolvedValue({
      preview: {
        kind: "project",
        projectCount: 1,
        discardedTemplateCount: 0,
        projectNames: ["Map"],
        conflicts: [],
        includesDevicePreferences: false,
        includesRecentMap: false,
        deviceStateConflicts: [],
        defaultConflictResolution: "keep-both",
      },
      commit: vi.fn(),
    });
    renderPanel({ prepareImport });
    const picker = screen.getByLabelText("Choose StackHatch backup");
    picker.focus();
    fireEvent.change(picker, {
      target: {
        files: [{ size: 8, text: vi.fn().mockResolvedValue("x") } as unknown as File],
      },
    });

    const heading = await screen.findByRole("heading", { name: "Ready to restore" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("list", { name: "Maps in this backup" })).toHaveAttribute(
      "tabindex",
      "0"
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByLabelText("Choose StackHatch backup")).toHaveFocus());
  });

  it("warns that templates in older backups are retired and will not be restored", async () => {
    const prepareImport = vi.fn().mockResolvedValue({
      preview: {
        kind: "vault",
        projectCount: 1,
        discardedTemplateCount: 2,
        projectNames: ["Imported map"],
        conflicts: [],
        includesDevicePreferences: false,
        includesRecentMap: false,
        deviceStateConflicts: [],
        defaultConflictResolution: "keep-both",
      },
      commit: vi.fn(),
    });
    renderPanel({ prepareImport });
    const file = {
      size: 32,
      text: vi.fn().mockResolvedValue("validated legacy backup bytes"),
    } as unknown as File;

    fireEvent.change(screen.getByLabelText("Choose StackHatch backup"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("region", { name: "Backup preview" })).toHaveTextContent(
      "1 map"
    );
    expect(screen.getByText(/older backup contains 2 retired templates/i)).toHaveTextContent(
      "They will not be restored."
    );
  });
});
