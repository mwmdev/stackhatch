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
});
