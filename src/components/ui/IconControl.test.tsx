import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import IconControl from "./IconControl";

function TestIcon() {
  return <svg data-testid="test-icon" />;
}

describe("IconControl", () => {
  it("renders an accessible icon button with a described tooltip", () => {
    render(
      <IconControl label="Open settings" tooltip="Settings">
        <TestIcon />
      </IconControl>
    );

    const button = screen.getByRole("button", { name: "Open settings" });
    const tooltip = screen.getByRole("tooltip", { name: "Settings" });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    expect(screen.getByTestId("test-icon").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(tooltip).toHaveClass("icon-control__tooltip");
  });

  it("forwards pressed, active, and native disabled button semantics", () => {
    render(
      <IconControl label="Toggle grid" pressed active disabled>
        <TestIcon />
      </IconControl>
    );

    const button = screen.getByRole("button", { name: "Toggle grid" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAttribute("data-active", "true");
    expect(button).toBeDisabled();
  });

  it("normalizes Space activation for a native popover target", () => {
    const onClick = vi.fn();
    render(
      <>
        <IconControl label="More actions" popoverTarget="more-actions" onClick={onClick}>
          <TestIcon />
        </IconControl>
        <div id="more-actions" popover="auto" />
      </>
    );

    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(fireEvent.keyDown(trigger, { key: " " })).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders active link semantics without nesting interactive elements", () => {
    render(
      <IconControl href="/app" label="All maps" active>
        <TestIcon />
      </IconControl>
    );

    const link = screen.getByRole("link", { name: "All maps" });
    expect(link).toHaveAttribute("href", "/app");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link.querySelector("button, a")).toBeNull();
  });

  it("suppresses pointer and keyboard activation for disabled links", () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <IconControl href="/app" label="All maps" disabled onClick={onClick} onKeyDown={onKeyDown}>
        <TestIcon />
      </IconControl>
    );

    const link = screen.getByRole("link", { name: "All maps" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
    expect(fireEvent.click(link)).toBe(false);
    expect(fireEvent.keyDown(link, { key: "Enter" })).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
