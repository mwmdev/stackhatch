import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DemoPage from "./page";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/components/public/LazyArchitectureDemo", () => ({
  default: () => <div data-testid="public-architecture-demo">Interactive map</div>,
}));

describe("DemoPage", () => {
  it("introduces an anonymous read-only product demo", () => {
    render(<DemoPage />);

    expect(
      screen.getByRole("heading", { name: "StackHatch, mapped by StackHatch." })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/real, read-only map generated from the public repository/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("public-architecture-demo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=/app"
    );
  });
});
