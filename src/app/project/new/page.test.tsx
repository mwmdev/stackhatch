import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NewProjectPage from "./page";

const mockWorkspace = vi.fn((props: { initialMode: string | null }) => (
  <div data-testid="project-start-workspace" data-mode={props.initialMode ?? "chooser"} />
));

vi.mock("@/components/projects/ProjectStartWorkspace", () => ({
  default: (props: { initialMode: string | null }) => mockWorkspace(props),
}));

describe("NewProjectPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["blank", "requirements", "repository", "template"])(
    "passes the non-sensitive %s mode to the client workspace",
    async (mode) => {
      render(await NewProjectPage({ searchParams: Promise.resolve({ mode }) }));
      expect(screen.getByTestId("project-start-workspace")).toHaveAttribute("data-mode", mode);
    }
  );

  it("does not pass repository or return identifiers through server-visible query input", async () => {
    render(
      await NewProjectPage({
        searchParams: Promise.resolve({
          mode: "repository",
          repo: "acme/private-context",
          returnTo: "/project/#local-map",
        } as { mode: string }),
      })
    );

    expect(mockWorkspace).toHaveBeenCalledWith({
      initialMode: "repository",
    });
  });
});
