import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ThemeToggle from "./ThemeToggle";

const { state, setTheme } = vi.hoisted(() => ({
  state: { theme: "light" as string | undefined },
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

    expect(
      screen.getByRole("button", { name: "Theme: Light. Change appearance" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tooltip", { name: "Theme: Light. Change appearance" })
    ).toBeInTheDocument();
  });

  it("renders a usable system control before the theme provider resolves", () => {
    state.theme = undefined;
    const { container } = render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "Theme: System. Change appearance" })
    ).toBeInTheDocument();
    expect(container.querySelector('[data-theme-icon="system"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Theme: System. Change appearance" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("falls back to the system icon for inherited object property names", () => {
    state.theme = "toString";
    const { container } = render(<ThemeToggle />);

    expect(container.querySelector('[data-theme-icon="system"]')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-theme-icon]")).toHaveLength(1);
  });

  it.each(["light", "dark", "system"])("shows the icon for the selected %s preference", (theme) => {
    state.theme = theme;
    const { container } = render(<ThemeToggle />);

    expect(container.querySelector(`[data-theme-icon="${theme}"]`)).toBeInTheDocument();
    expect(container.querySelectorAll("[data-theme-icon]")).toHaveLength(1);
  });

  it.each([
    ["light", "dark"],
    ["dark", "system"],
    ["system", "light"],
  ])("cycles %s to %s", (theme, nextTheme) => {
    state.theme = theme;
    render(<ThemeToggle />);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}. Change appearance`,
      })
    );

    expect(setTheme).toHaveBeenCalledWith(nextTheme);
  });

  it("renders a repeatable disclosure row with the current value and announcement", () => {
    render(<ThemeToggle variant="row" />);

    const control = screen.getByRole("button", {
      name: "Theme: Light. Change appearance",
    });
    expect(control).toHaveTextContent("Theme");
    expect(control).toHaveTextContent("Light");

    fireEvent.click(control);
    expect(setTheme).toHaveBeenCalledWith("dark");
    expect(screen.getByRole("status")).toHaveTextContent("Theme changed to Dark");
  });
});
