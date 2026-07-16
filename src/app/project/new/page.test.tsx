import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NewProjectPage from "./page";

const mockWorkspace = vi.fn(
  (props: { initialMode: string | null; initialRepository: string; returnTo: string | null }) => (
    <div
      data-testid="project-start-workspace"
      data-mode={props.initialMode ?? "chooser"}
      data-repository={props.initialRepository}
      data-return-to={props.returnTo ?? ""}
    />
  )
);

vi.mock("@/components/projects/ProjectStartWorkspace", () => ({
  default: (props: {
    initialMode: string | null;
    initialRepository: string;
    returnTo: string | null;
  }) => mockWorkspace(props),
}));

async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = await NewProjectPage({ searchParams: Promise.resolve(searchParams) });
  return render(page);
}

describe("NewProjectPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the chooser for a bare or unsupported mode", async () => {
    await renderPage({ mode: "surprise" });

    expect(screen.getByTestId("project-start-workspace")).toHaveAttribute("data-mode", "chooser");
  });

  it.each(["blank", "requirements", "repository", "template"])(
    "passes the canonical %s mode to the workspace",
    async (mode) => {
      await renderPage({ mode });

      expect(screen.getByTestId("project-start-workspace")).toHaveAttribute("data-mode", mode);
    }
  );

  it("preserves only a validated public repository slug", async () => {
    await renderPage({ mode: "repository", repo: "acme/platform.api" });
    expect(screen.getByTestId("project-start-workspace")).toHaveAttribute(
      "data-repository",
      "acme/platform.api"
    );

    await renderPage({ mode: "repository", repo: "https://evil.example/acme/api" });
    const workspaces = screen.getAllByTestId("project-start-workspace");
    expect(workspaces.at(-1)).toHaveAttribute("data-repository", "");
  });

  it("preserves only an exact project return route", async () => {
    await renderPage({ mode: "template", returnTo: "/project/map-1" });
    expect(screen.getByTestId("project-start-workspace")).toHaveAttribute(
      "data-return-to",
      "/project/map-1"
    );

    await renderPage({ mode: "template", returnTo: "https://evil.example/project/map-1" });
    const workspaces = screen.getAllByTestId("project-start-workspace");
    expect(workspaces.at(-1)).toHaveAttribute("data-return-to", "");
  });

  it("ignores array-valued query input instead of guessing", async () => {
    await renderPage({
      mode: ["repository", "blank"],
      repo: ["acme/api", "other/repo"],
      returnTo: ["/project/map-1", "/project/map-2"],
    });

    const workspace = screen.getByTestId("project-start-workspace");
    expect(workspace).toHaveAttribute("data-mode", "chooser");
    expect(workspace).toHaveAttribute("data-repository", "");
    expect(workspace).toHaveAttribute("data-return-to", "");
  });
});
