"use client";

import { Focus, MessageSquareText, PanelLeftClose, ZoomIn, ZoomOut } from "lucide-react";
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
  displaySettings: EditorDisplaySettings;
  onDisplaySettingsChange: (next: EditorDisplaySettings) => void;
  obscured: boolean;
  dialogOpen: boolean;
}

export default function EditorToolSurface({
  chatOpen,
  onChatOpenChange,
  onAddNode,
  customSubtypes,
  onZoomIn,
  onZoomOut,
  onFitView,
  displaySettings,
  onDisplaySettingsChange,
  obscured,
  dialogOpen,
}: EditorToolSurfaceProps) {
  return (
    <div
      className="editor-tool-surface"
      data-testid="editor-tool-surface"
      data-mobile-placement="bottom"
      data-desktop-placement="left"
      data-obscured={String(obscured)}
      data-dialog-open={String(dialogOpen)}
      aria-hidden={dialogOpen || undefined}
      inert={dialogOpen || undefined}
    >
      <IconControl
        label={chatOpen ? "Close chat" : "Open chat"}
        tooltipPlacement="top"
        pressed={chatOpen}
        onClick={() => onChatOpenChange(!chatOpen)}
        className="h-11 w-11"
      >
        {chatOpen ? (
          <PanelLeftClose className="h-[18px] w-[18px]" />
        ) : (
          <MessageSquareText className="h-[18px] w-[18px]" />
        )}
      </IconControl>

      <AddNodeDropdown
        onAddNode={onAddNode}
        customSubtypes={customSubtypes}
        iconOnly
        placement="responsive"
      />

      <span className="editor-tool-surface__separator" aria-hidden="true" />

      <IconControl label="Zoom in" tooltipPlacement="top" onClick={onZoomIn} className="h-11 w-11">
        <ZoomIn className="h-[18px] w-[18px]" />
      </IconControl>
      <IconControl
        label="Zoom out"
        tooltipPlacement="top"
        onClick={onZoomOut}
        className="h-11 w-11"
      >
        <ZoomOut className="h-[18px] w-[18px]" />
      </IconControl>
      <IconControl
        label="Fit map to view"
        tooltipPlacement="top"
        onClick={onFitView}
        className="h-11 w-11"
      >
        <Focus className="h-[18px] w-[18px]" />
      </IconControl>

      <EditorDisplaySettingsDropdown
        value={displaySettings}
        onChange={onDisplaySettingsChange}
        placement="responsive"
      />
    </div>
  );
}
