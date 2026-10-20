"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

const DEFAULT_WIDTH = 392;
const MIN_WIDTH = 320;
const MAX_WIDTH = 520;
const MIN_CANVAS_WIDTH = 320;
// Matches --rail-width (3.5rem) in globals.css: the tool rail sits beside the dock.
const RAIL_WIDTH = 56;
const KEYBOARD_STEP = 24;
const STORAGE_KEY = "stackhatch:editor-chat-sidebar-width";

interface ResizableChatSidebarProps {
  children: ReactNode;
  open: boolean;
}

interface ResizeOrigin {
  pointerId: number;
  startWidth: number;
  startX: number;
}

function availableMaxWidth() {
  if (typeof window === "undefined") return MAX_WIDTH;
  return Math.max(
    MIN_WIDTH,
    Math.min(MAX_WIDTH, window.innerWidth - RAIL_WIDTH - MIN_CANVAS_WIDTH)
  );
}

function clampWidth(width: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(MIN_WIDTH, Math.round(width)));
}

function readStoredWidth() {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function persistWidth(width: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

export default function ResizableChatSidebar({ children, open }: ResizableChatSidebarProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [maxWidth, setMaxWidth] = useState(MAX_WIDTH);
  const [resizing, setResizing] = useState(false);
  const preferredWidthRef = useRef(DEFAULT_WIDTH);
  const widthRef = useRef(DEFAULT_WIDTH);
  const maxWidthRef = useRef(MAX_WIDTH);
  const resizeOriginRef = useRef<ResizeOrigin | null>(null);

  const applyPreferredWidth = useCallback((preferredWidth: number) => {
    const nextWidth = clampWidth(preferredWidth, maxWidthRef.current);
    if (nextWidth === widthRef.current) return false;
    preferredWidthRef.current = nextWidth;
    widthRef.current = nextWidth;
    setWidth(nextWidth);
    return true;
  }, []);

  useEffect(() => {
    const updateViewportBounds = () => {
      const nextMaxWidth = availableMaxWidth();
      const nextWidth = clampWidth(preferredWidthRef.current, nextMaxWidth);
      if (nextMaxWidth !== maxWidthRef.current) {
        maxWidthRef.current = nextMaxWidth;
        setMaxWidth(nextMaxWidth);
      }
      if (nextWidth !== widthRef.current) {
        widthRef.current = nextWidth;
        setWidth(nextWidth);
      }
    };

    preferredWidthRef.current = readStoredWidth();
    updateViewportBounds();
    window.addEventListener("resize", updateViewportBounds);
    return () => window.removeEventListener("resize", updateViewportBounds);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizing]);

  const finishPointerResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (resizeOriginRef.current?.pointerId !== event.pointerId) return;
    resizeOriginRef.current = null;
    setResizing(false);
    persistWidth(preferredWidthRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      let nextWidth: number | null = null;
      if (event.key === "ArrowLeft") nextWidth = width - KEYBOARD_STEP;
      if (event.key === "ArrowRight") nextWidth = width + KEYBOARD_STEP;
      if (event.key === "Home") nextWidth = MIN_WIDTH;
      if (event.key === "End") nextWidth = maxWidth;
      if (nextWidth === null) return;

      event.preventDefault();
      if (applyPreferredWidth(nextWidth)) persistWidth(preferredWidthRef.current);
    },
    [applyPreferredWidth, maxWidth, width]
  );

  // Docked (641 px and up): the dock slides on its width while the panel inside
  // keeps its full width and stays anchored to the right, so the 2 px panel
  // edge leads the slide and text is revealed rather than reflowed. The grip
  // sits on that edge. Phone: a full-width sheet with the edge on top; the
  // editor places it over the canvas.
  return (
    <div
      id="editor-chat-sidebar"
      data-open={open ? "true" : "false"}
      data-resizing={resizing ? "true" : undefined}
      style={{ "--chat-sidebar-width": `${width}px` } as CSSProperties}
      className={`relative flex h-full flex-none justify-end overflow-hidden max-[641px]:w-full ${
        resizing
          ? ""
          : "min-[641px]:transition-[width] min-[641px]:duration-180 min-[641px]:ease-standard"
      } ${open ? "min-[641px]:w-[var(--chat-sidebar-width)]" : "max-[641px]:hidden min-[641px]:w-0"}`}
    >
      <div className="h-full flex-none border-panel-edge bg-paper max-[641px]:w-full max-[641px]:border-t-2 min-[641px]:w-[var(--chat-sidebar-width)] min-[641px]:border-r-2">
        {children}
      </div>
      {open ? (
        <div
          role="separator"
          aria-label="Resize chat sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={maxWidth}
          aria-valuenow={width}
          aria-valuetext={`${width} pixels`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            resizeOriginRef.current = {
              pointerId: event.pointerId,
              startWidth: width,
              startX: event.clientX,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            setResizing(true);
          }}
          onPointerMove={(event) => {
            const origin = resizeOriginRef.current;
            if (!origin || origin.pointerId !== event.pointerId) return;
            event.preventDefault();
            applyPreferredWidth(origin.startWidth + event.clientX - origin.startX);
          }}
          onPointerUp={finishPointerResize}
          onPointerCancel={finishPointerResize}
          onLostPointerCapture={finishPointerResize}
          className="group absolute inset-y-0 right-0 z-30 hidden w-2 cursor-col-resize touch-none items-center justify-end outline-offset-[-2px] min-[641px]:flex"
        >
          <span
            aria-hidden="true"
            className={`h-11 w-1 rounded-l-[1px] transition-colors duration-120 ease-standard ${
              resizing
                ? "bg-primary"
                : "bg-ink2 group-hover:bg-primary group-focus-visible:bg-primary"
            }`}
          />
        </div>
      ) : null}
    </div>
  );
}
