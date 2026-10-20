"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface EditorDisplaySettings {
  showNodeCategory: boolean;
  showEdgeLabels: boolean;
  showDescriptionOnHover: boolean;
}

export const DEFAULT_EDITOR_DISPLAY_SETTINGS: EditorDisplaySettings = {
  showNodeCategory: true,
  showEdgeLabels: true,
  showDescriptionOnHover: true,
};

export function normalizeEditorDisplaySettings(value: unknown): EditorDisplaySettings {
  const stored =
    value && typeof value === "object" ? (value as Partial<EditorDisplaySettings>) : {};

  return {
    showNodeCategory:
      typeof stored.showNodeCategory === "boolean"
        ? stored.showNodeCategory
        : DEFAULT_EDITOR_DISPLAY_SETTINGS.showNodeCategory,
    showEdgeLabels:
      typeof stored.showEdgeLabels === "boolean"
        ? stored.showEdgeLabels
        : DEFAULT_EDITOR_DISPLAY_SETTINGS.showEdgeLabels,
    showDescriptionOnHover:
      typeof stored.showDescriptionOnHover === "boolean"
        ? stored.showDescriptionOnHover
        : DEFAULT_EDITOR_DISPLAY_SETTINGS.showDescriptionOnHover,
  };
}

const EditorDisplaySettingsContext = createContext<EditorDisplaySettings>(
  DEFAULT_EDITOR_DISPLAY_SETTINGS
);

export function EditorDisplaySettingsProvider({
  value,
  children,
}: {
  value: EditorDisplaySettings;
  children: ReactNode;
}) {
  return (
    <EditorDisplaySettingsContext.Provider value={value}>
      {children}
    </EditorDisplaySettingsContext.Provider>
  );
}

export function useEditorDisplaySettings() {
  return useContext(EditorDisplaySettingsContext);
}
