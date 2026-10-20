import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { VaultInvalidation } from "@/lib/vault/coordination";
import type { VaultProjectRecord } from "@/lib/vault/schema";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import AllMapsPage from "./AllMapsPage";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

const projects = [
  {
    id: "newest",
    name: "Newest map",
    description: "Latest architecture",
    repoUrl: null,
    canvasState: null,
    revision: 2,
    createdAt: 1,
    updatedAt: 30,
  },
  {
    id: "older",
    name: "Older map",
    description: null,
    repoUrl: null,
    canvasState: null,
    revision: 1,
    createdAt: 2,
    updatedAt: 20,
  },
];

function makeVault(overrides: Partial<WorkspaceVault> = {}) {
  return {
    listProjects: vi.fn().mockResolvedValue(projects),
    updateProjectDescription: vi
      .fn()
      .mockImplementation(async (project: VaultProjectRecord, description: string | null) => ({
        ...project,
        description,
        revision: project.revision + 1,
        updatedAt: 40,
      })),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    subscribeInvalidation: vi.fn(() => () => undefined),
    ...overrides,
  } as unknown as WorkspaceVault;
}

describe("AllMapsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders your maps on this device with no account controls or network reads", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    render(<AllMapsPage vault={makeVault()} />);

    expect(screen.getByText(/Loading your maps on this device/)).toBeInTheDocument();
    expect(await screen.findByText("Newest map")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Your maps on this device" })).toBeInTheDocument();
    expect(screen.getByText("2 on this device")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Backup and restore" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Back up all maps" })).toBeVisible();
    expect(screen.getByLabelText("Choose StackHatch backup")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back up or restore" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-stack-illustration]")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens a selected map through the static fragment route", async () => {
    render(<AllMapsPage vault={makeVault()} />);
    fireEvent.click(await screen.findByTestId("project-card-older"));
    expect(push).toHaveBeenCalledWith("/project/#older");
  });

  it("offers a new map and the backup picker when the device has no maps", async () => {
    const pick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    render(<AllMapsPage vault={makeVault({ listProjects: vi.fn().mockResolvedValue([]) })} />);

    expect(
      await screen.findByRole("heading", { name: "No maps on this device yet" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/on this device$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose backup to restore" }));
    expect(pick.mock.contexts[0]).toBe(screen.getByLabelText("Choose StackHatch backup"));
    pick.mockRestore();
  });

  it("edits a description inline and saves it with Enter", async () => {
    const updateProjectDescription = vi
      .fn()
      .mockImplementation(async (project: VaultProjectRecord, description: string | null) => ({
        ...project,
        description,
        revision: project.revision + 1,
        updatedAt: 40,
      }));
    render(<AllMapsPage vault={makeVault({ updateProjectDescription })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit description for Older map" }));
    const input = screen.getByRole("textbox", { name: "Description for Older map" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "Legacy architecture" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(updateProjectDescription).toHaveBeenCalledWith(projects[1], "Legacy architecture")
    );
    expect(
      screen.getByRole("button", { name: "Edit description for Older map" })
    ).toHaveTextContent("Legacy architecture");
  });

  it("preserves multiline requirements and reserves Shift+Enter for a newline", async () => {
    const requirementsProject = {
      ...projects[0],
      description: "# Requirements\n\n- Preserve the map structure",
    };
    const updateProjectDescription = vi
      .fn()
      .mockImplementation(async (project: VaultProjectRecord, description: string | null) => ({
        ...project,
        description,
        revision: project.revision + 1,
        updatedAt: 40,
      }));
    render(
      <AllMapsPage
        vault={makeVault({
          listProjects: vi.fn().mockResolvedValue([requirementsProject]),
          updateProjectDescription,
        })}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit description for Newest map" }));
    const editor = screen.getByRole("textbox", { name: "Description for Newest map" });
    expect(editor.tagName).toBe("TEXTAREA");
    expect(editor).toHaveValue("# Requirements\n\n- Preserve the map structure");

    fireEvent.change(editor, {
      target: {
        value: "# Requirements\n\n- Preserve the map structure\n- Keep line breaks",
      },
    });
    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });

    expect(updateProjectDescription).not.toHaveBeenCalled();
    expect(editor).toHaveFocus();

    fireEvent.keyDown(editor, { key: "Enter" });
    await waitFor(() =>
      expect(updateProjectDescription).toHaveBeenCalledWith(
        requirementsProject,
        "# Requirements\n\n- Preserve the map structure\n- Keep line breaks"
      )
    );
  });

  it("saves on blur, normalizes empty descriptions, and cancels with Escape", async () => {
    const updateProjectDescription = vi
      .fn()
      .mockImplementation(async (project: VaultProjectRecord, description: string | null) => ({
        ...project,
        description,
        revision: project.revision + 1,
        updatedAt: 40,
      }));
    render(<AllMapsPage vault={makeVault({ updateProjectDescription })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit description for Newest map" }));
    let input = screen.getByRole("textbox", { name: "Description for Newest map" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    await waitFor(() => expect(updateProjectDescription).toHaveBeenCalledWith(projects[0], null));
    expect(
      screen.getByRole("button", { name: "Edit description for Newest map" })
    ).toHaveTextContent("Add a description");

    fireEvent.click(screen.getByRole("button", { name: "Edit description for Older map" }));
    input = screen.getByRole("textbox", { name: "Description for Older map" });
    fireEvent.change(input, { target: { value: "Discard me" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(updateProjectDescription).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Edit description for Older map" })
    ).toHaveTextContent("Add a description");
  });

  it("keeps an unsaved description editable after browser storage fails", async () => {
    const updateProjectDescription = vi.fn().mockRejectedValue(new Error("conflict"));
    render(<AllMapsPage vault={makeVault({ updateProjectDescription })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit description for Older map" }));
    const input = screen.getByRole("textbox", { name: "Description for Older map" });
    fireEvent.change(input, { target: { value: "Keep this draft" } });
    fireEvent.blur(input);

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.getByRole("textbox", { name: "Description for Older map" })).toHaveValue(
      "Keep this draft"
    );
  });

  it("shows a recoverable storage failure and retries", async () => {
    const listProjects = vi
      .fn()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(projects);
    render(<AllMapsPage vault={makeVault({ listProjects })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("browser storage permissions");
    fireEvent.click(screen.getByRole("button", { name: "Retry browser storage" }));
    expect(await screen.findByText("Newest map")).toBeInTheDocument();
  });

  it("deletes with a vault revision and keeps failures retryable", async () => {
    const deleteProject = vi
      .fn()
      .mockRejectedValueOnce(new Error("conflict"))
      .mockResolvedValueOnce(undefined);
    render(<AllMapsPage vault={makeVault({ deleteProject })} />);

    fireEvent.click(await screen.findByRole("button", { name: "More actions for Newest map" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Newest map" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be deleted");
    fireEvent.click(screen.getByRole("button", { name: "Retry delete" }));
    await waitFor(() => expect(screen.queryByText("Newest map")).not.toBeInTheDocument());
    expect(deleteProject).toHaveBeenCalledWith(projects[0]);
  });

  it("deletes with the updated revision when opening delete blurs a description save", async () => {
    let resolveDescriptionSave: ((updatedProject: VaultProjectRecord) => void) | undefined;
    const updatedProject = {
      ...projects[0],
      description: "Updated before delete",
      revision: projects[0].revision + 1,
      updatedAt: 40,
    };
    const updateProjectDescription = vi.fn(
      () =>
        new Promise<VaultProjectRecord>((resolve) => {
          resolveDescriptionSave = resolve;
        })
    );
    const deleteProject = vi.fn().mockResolvedValue(undefined);
    render(<AllMapsPage vault={makeVault({ updateProjectDescription, deleteProject })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit description for Newest map" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description for Newest map" }), {
      target: { value: "Updated before delete" },
    });
    fireEvent.click(screen.getByRole("button", { name: "More actions for Newest map" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Newest map" }));

    await waitFor(() =>
      expect(updateProjectDescription).toHaveBeenCalledWith(projects[0], "Updated before delete")
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();

    await act(async () => {
      resolveDescriptionSave?.(updatedProject);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith(updatedProject));
  });

  it("reloads the library after a cross-tab project invalidation", async () => {
    let listener: ((invalidation: VaultInvalidation) => void) | undefined;
    const listProjects = vi
      .fn()
      .mockResolvedValueOnce(projects)
      .mockResolvedValueOnce([projects[1]]);
    const localVault = makeVault({
      listProjects,
      subscribeInvalidation: vi.fn((next) => {
        listener = next;
        return () => undefined;
      }),
    });
    render(<AllMapsPage vault={localVault} />);
    await screen.findByText("Newest map");

    listener?.({
      sourceId: "other-tab",
      generation: "generation-1",
      projectId: "newest",
      projectRevision: null,
      stores: ["projects"],
      reason: "deletion",
    });

    await waitFor(() => expect(screen.queryByText("Newest map")).not.toBeInTheDocument());
    expect(listProjects).toHaveBeenCalledTimes(2);
  });
});
