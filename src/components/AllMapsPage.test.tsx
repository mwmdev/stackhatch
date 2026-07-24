import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { VaultInvalidation } from "@/lib/vault/coordination";
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
    expect(screen.getByRole("table", { name: "Your maps on this device" })).toBeInTheDocument();
    expect(screen.getByText(/Your maps on this device stay in this browser profile/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back up or restore" })).toHaveAttribute(
      "href",
      "/settings#backups"
    );
    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-stack-illustration]")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opens a selected map through the static fragment route", async () => {
    render(<AllMapsPage vault={makeVault()} />);
    fireEvent.click(await screen.findByTestId("project-card-older"));
    expect(push).toHaveBeenCalledWith("/project/#older");
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

    fireEvent.click(await screen.findByRole("button", { name: "Delete Newest map" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be deleted");
    fireEvent.click(screen.getByRole("button", { name: "Retry delete" }));
    await waitFor(() => expect(screen.queryByText("Newest map")).not.toBeInTheDocument());
    expect(deleteProject).toHaveBeenCalledWith(projects[0]);
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
