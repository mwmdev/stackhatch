import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "./page";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

describe("LandingPage", () => {
  it("renders a public free BYOK landing page", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: /StackHatch maps your architecture before the build hardens/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the workspace/i })).toHaveAttribute(
      "href",
      "/login?callbackUrl=/app"
    );
    expect(screen.getByText("Free to use. Bring your own Anthropic API key.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /pricing|plans/i })).not.toBeInTheDocument();
  });

  it("shows real product views for the three strongest workflows", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: /Three decisions, one shared map/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Start from the system that already exists/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Ask for changes without losing approved decisions/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Leave with a diagram, alternatives, and a PRD/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /StackHatch workspace showing/i })).toHaveLength(4);
  });
});
