import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditorDisplaySettingsDropdown from "./EditorDisplaySettingsDropdown";
import { DEFAULT_EDITOR_DISPLAY_SETTINGS } from "./EditorDisplaySettings";

describe("EditorDisplaySettingsDropdown", () => {
  it("places the editor menu upward on the phone dock and inward on the desktop rail", () => {
    render(
      <EditorDisplaySettingsDropdown
        value={DEFAULT_EDITOR_DISPLAY_SETTINGS}
        onChange={vi.fn()}
        placement="responsive"
      />
    );

    const trigger = screen.getByRole("button", { name: "Editor display settings" });
    expect(trigger).toHaveClass("icon-control");
    expect(trigger).toHaveAttribute("aria-describedby");
    expect(screen.getByRole("tooltip", { name: "Editor display settings" })).toHaveAttribute(
      "data-placement",
      "top"
    );

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("editor-display-settings-dropdown")).toHaveAttribute(
      "data-placement",
      "responsive"
    );
  });
});
