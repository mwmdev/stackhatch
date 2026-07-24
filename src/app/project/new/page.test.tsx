import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NewProjectPage from "./page";

const mockWorkspace = vi.fn((props: { initialMode: string | null }) => (
  <div data-testid="project-start-workspace" data-mode={props.initialMode ?? "chooser"} />
));

vi.mock("@/components/projects/ProjectStartWorkspace", () => ({
  default: (props: { initialMode: string | null }) => mockWorkspace(props),
}));

describe("NewProjectPage", () => {
  it("renders one static shell and leaves all URL context to the browser workspace", () => {
    render(<NewProjectPage />);
    expect(screen.getByTestId("project-start-workspace")).toHaveAttribute("data-mode", "chooser");
    expect(mockWorkspace).toHaveBeenCalledWith({ initialMode: null });
  });
});
