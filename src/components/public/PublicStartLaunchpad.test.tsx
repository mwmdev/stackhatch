import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicStartLaunchpad from "./PublicStartLaunchpad";

const { push, markProjectStart, trackEvent } = vi.hoisted(() => ({
  push: vi.fn(),
  markProjectStart: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/project-start", () => ({
  markProjectStart,
  buildProjectStartLoginUrl: (method: string, repo?: string) =>
    `/login?method=${method}${repo ? `&repo=${repo}` : ""}`,
}));
vi.mock("@/lib/analytics", () => ({ trackEvent }));

describe("PublicStartLaunchpad", () => {
  beforeEach(() => {
    push.mockClear();
    markProjectStart.mockClear();
    trackEvent.mockClear();
  });

  it("exposes a dependable named group with level-three card headings", () => {
    render(<PublicStartLaunchpad />);

    const launchpad = screen.getByRole("group", { name: "Ways to start a StackHatch map" });

    expect(launchpad).toBeInTheDocument();
    for (const name of ["Start fresh", "Upload requirements", "Map a repo", "Use a template"]) {
      expect(within(launchpad).getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
  });

  it.each([
    ["Open blank canvas", "blank"],
    ["Upload .md or .txt", "requirements"],
    ["Choose a template", "template"],
  ])("preserves the %s start through sign in", (label, method) => {
    render(<PublicStartLaunchpad />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(markProjectStart).toHaveBeenCalledWith(method);
    expect(push).toHaveBeenCalledWith(`/login?method=${method}`);
    expect(trackEvent).toHaveBeenCalledWith("project_start_selected", {
      location: "launchpad",
      start_method: method,
    });
  });

  it("validates and preserves a public repository", () => {
    render(<PublicStartLaunchpad />);
    const input = screen.getByRole("textbox", { name: "Public GitHub repository" });

    fireEvent.change(input, { target: { value: "not a repository" } });
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));
    expect(screen.getByRole("alert")).toHaveTextContent("public GitHub repository");
    expect(push).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("repository_intent_submitted", {
      location: "launchpad",
      error_category: "invalid_url",
    });

    fireEvent.change(input, { target: { value: "https://github.com/mwmdev/stackhatch.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Map repository" }));

    expect(markProjectStart).toHaveBeenCalledWith("repository");
    expect(trackEvent).toHaveBeenCalledWith("project_start_selected", {
      location: "launchpad",
      start_method: "repository",
    });
    expect(trackEvent).toHaveBeenCalledWith("repository_intent_submitted", {
      location: "launchpad",
      start_method: "repository",
    });
    expect(push).toHaveBeenCalledWith("/login?method=repository&repo=mwmdev/stackhatch");
  });
});
