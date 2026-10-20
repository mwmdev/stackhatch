"use client";

import { memo } from "react";
import { Focus, LayoutDashboard, MessageSquareText, ZoomIn, ZoomOut } from "lucide-react";
import IconControl from "@/components/ui/IconControl";
import type { NodeCategory, NodeSubtype } from "@/types/stack";
import type { CustomSubtypesMap } from "@/lib/custom-subtypes";
import AddNodeDropdown from "./AddNodeDropdown";
import EditorDisplaySettingsDropdown from "./EditorDisplaySettingsDropdown";
import type { EditorDisplaySettings } from "./EditorDisplaySettings";

interface EditorToolSurfaceProps {
  chatOpen: boolean;
  onChatOpenChange: (open: boolean) => void;
  onAddNode: (category: NodeCategory, subtype: NodeSubtype) => void;
  customSubtypes?: CustomSubtypesMap;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAutoLayout: () => void;
  displaySettings: EditorDisplaySettings;
  onDisplaySettingsChange: (next: EditorDisplaySettings) => void;
  dialogOpen: boolean;
  mutationBlocked?: boolean;
}

/**
 * The editor's tool rail: an ink-frame column left of the work area, and a
 * bottom dock on phones. The same seven tools in the same order either way.
 */
function EditorToolSurface({
  chatOpen,
  onChatOpenChange,
  onAddNode,
  customSubtypes,
  onZoomIn,
  onZoomOut,
  onFitView,
  onAutoLayout,
  displaySettings,
  onDisplaySettingsChange,
  dialogOpen,
  mutationBlocked = false,
}: EditorToolSurfaceProps) {
  return (
    <div
      role="group"
      aria-label="Canvas tools"
      className="editor-tool-surface ink-frame"
      data-orientation="vertical"
      data-testid="editor-tool-surface"
      aria-hidden={dialogOpen || undefined}
      inert={dialogOpen || undefined}
    >
      <IconControl
        label={chatOpen ? "Close chat" : "Open chat"}
        surface="frame"
        tooltipPlacement="right"
        pressed={chatOpen}
        aria-controls="editor-chat-sidebar"
        onClick={() => onChatOpenChange(!chatOpen)}
      >
        <MessageSquareText />
      </IconControl>

      <AddNodeDropdown
        onAddNode={onAddNode}
        customSubtypes={customSubtypes}
        disabled={mutationBlocked}
      />

      <span className="ink-frame__divider" aria-hidden="true" />

      <IconControl label="Zoom in" surface="frame" tooltipPlacement="right" onClick={onZoomIn}>
        <ZoomIn />
      </IconControl>
      <IconControl label="Zoom out" surface="frame" tooltipPlacement="right" onClick={onZoomOut}>
        <ZoomOut />
      </IconControl>
      <IconControl
        label="Fit map to view"
        surface="frame"
        tooltipPlacement="right"
        onClick={onFitView}
      >
        <Focus />
      </IconControl>
      <IconControl
        label="Auto-layout"
        surface="frame"
        tooltipPlacement="right"
        onClick={onAutoLayout}
        disabled={mutationBlocked}
      >
        <LayoutDashboard />
      </IconControl>

      <span className="ink-frame__divider" aria-hidden="true" />

      <EditorDisplaySettingsDropdown value={displaySettings} onChange={onDisplaySettingsChange} />
    </div>
  );
}

export default memo(EditorToolSurface);
