import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditorDisplaySettingsDropdown from "./EditorDisplaySettingsDropdown";
import { DEFAULT_EDITOR_DISPLAY_SETTINGS } from "./EditorDisplaySettings";

describe("EditorDisplaySettingsDropdown", () => {
  it("opens the display menu and reports it as expanded", () => {
    render(
      <EditorDisplaySettingsDropdown value={DEFAULT_EDITOR_DISPLAY_SETTINGS} onChange={vi.fn()} />
    );

    const trigger = screen.getByRole("button", { name: "Editor display settings" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("checkbox", { name: "Node category" })).toBeChecked();
  });

  it("updates whether node descriptions appear on hover", () => {
    const onChange = vi.fn();
    render(
      <EditorDisplaySettingsDropdown value={DEFAULT_EDITOR_DISPLAY_SETTINGS} onChange={onChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Editor display settings" }));
    const checkbox = screen.getByRole("checkbox", { name: "Show description on hover" });

    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_EDITOR_DISPLAY_SETTINGS,
      showDescriptionOnHover: false,
    });
  });
  it("closes on Escape and returns focus to the trigger", () => {
    render(
      <EditorDisplaySettingsDropdown value={DEFAULT_EDITOR_DISPLAY_SETTINGS} onChange={vi.fn()} />
    );
    const trigger = screen.getByRole("button", { name: "Editor display settings" });
    fireEvent.click(trigger);
    screen.getByRole("checkbox", { name: "Edge labels" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("editor-display-settings-dropdown")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
