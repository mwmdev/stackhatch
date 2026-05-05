"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface EditorDisplaySettings {
  showNodeCategory: boolean;
  showEdgeLabels: boolean;
}

export const DEFAULT_EDITOR_DISPLAY_SETTINGS: EditorDisplaySettings = {
  showNodeCategory: true,
  showEdgeLabels: true,
};

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
