import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_DISPLAY_SETTINGS,
  normalizeEditorDisplaySettings,
} from "./EditorDisplaySettings";

describe("normalizeEditorDisplaySettings", () => {
  it("restores all persisted editor display preferences", () => {
    expect(
      normalizeEditorDisplaySettings({
        showNodeCategory: false,
        showEdgeLabels: false,
        showDescriptionOnHover: false,
      })
    ).toEqual({
      showNodeCategory: false,
      showEdgeLabels: false,
      showDescriptionOnHover: false,
    });
  });

  it("keeps hover descriptions enabled for legacy stored settings", () => {
    expect(
      normalizeEditorDisplaySettings({
        showNodeCategory: false,
        showEdgeLabels: true,
      })
    ).toEqual({
      ...DEFAULT_EDITOR_DISPLAY_SETTINGS,
      showNodeCategory: false,
    });
  });
});
