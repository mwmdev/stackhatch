import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "./page";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

describe("LandingPage", () => {
  it("renders a public SaaS landing page with app and pricing CTAs", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: /StackHatch turns codebases and ideas into architecture you can ship/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start free with BYOK/i })).toHaveAttribute(
      "href",
      "/login?callbackUrl=/app"
    );
    expect(screen.getByRole("link", { name: /View pricing/i })).toHaveAttribute("href", "/pricing");
  });

  it("shows animated examples for the three strongest product workflows", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: /Three short loops from the most useful StackHatch workflows/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Repo to architecture map/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Change the stack without losing decisions/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Compare alternatives and export the plan/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Animated demo showing/i })).toHaveLength(3);
  });
});
