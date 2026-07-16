import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "./ThemeToggle";

const { state, setTheme } = vi.hoisted(() => ({
  state: { theme: "light" },
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: state.theme, setTheme }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    state.theme = "light";
    setTheme.mockClear();
  });

  it("uses the shared named icon control with a focus-visible label", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Theme: light" })).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { name: "Theme: light" })).toBeInTheDocument();
  });

  it.each([
    ["light", "dark"],
    ["dark", "system"],
    ["system", "light"],
  ])("cycles %s to %s", (theme, nextTheme) => {
    state.theme = theme;
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: `Theme: ${theme}` }));

    expect(setTheme).toHaveBeenCalledWith(nextTheme);
  });
});
