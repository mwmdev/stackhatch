import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceVault } from "@/lib/vault/workspace";
import AppResolver from "./AppResolver";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

function vault(resolveResume: WorkspaceVault["resolveResume"]): WorkspaceVault {
  return { resolveResume } as WorkspaceVault;
}

describe("AppResolver", () => {
  beforeEach(() => {
    replace.mockClear();
    window.history.replaceState({}, "", "/app");
  });

  it("resolves the last local map after mount and keeps its ID in the fragment", async () => {
    const localVault = vault(
      vi.fn().mockResolvedValue({
        id: "map-1",
      })
    );
    const { container } = render(<AppResolver vault={localVault} />);

    expect(screen.getByRole("status")).toHaveTextContent("Opening your maps on this device");
    expect(container.querySelector("[data-stack-illustration]")).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/#map-1"));
  });

  it("opens creation for a fresh browser vault", async () => {
    render(<AppResolver vault={vault(vi.fn().mockResolvedValue(null))} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/new"));
  });

  it("canonicalizes a legacy repository URL without sending its context in the new query", async () => {
    window.history.replaceState({}, "", "/app?repo=acme%2Fapi#start");
    render(<AppResolver vault={vault(vi.fn().mockResolvedValue(null))} />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/project/new?mode=repository#repo=acme%2Fapi")
    );
  });

  it("blocks on unavailable storage and offers a retry", async () => {
    const resolveResume = vi
      .fn()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(null);
    render(<AppResolver vault={vault(resolveResume)} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("browser vault could not be opened");
    fireEvent.click(screen.getByRole("button", { name: "Retry browser storage" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/project/new"));
  });
});
