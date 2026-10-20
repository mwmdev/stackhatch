"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The union of the selectors the four hand-rolled traps used before this hook
 * replaced them. Each of those lists was a subset of this one, so widening it
 * cannot skip an element any of them used to reach.
 */
const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])";

export interface FocusTrapOptions {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Focus returns here on close, ahead of whatever was focused when it opened. */
  invokerRef?: RefObject<HTMLElement | null>;
  /** Focused on open, ahead of `[data-autofocus]` and the first focusable. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** When false, Escape is ignored — for a destructive action already committed. */
  canClose?: boolean;
  /** Marked inert and hidden from assistive tech while open. */
  inertSelector?: string;
}

export function useFocusTrap({
  open,
  onClose,
  containerRef,
  invokerRef,
  initialFocusRef,
  canClose = true,
  inertSelector,
}: FocusTrapOptions) {
  // Read at keydown time, so a new inline `onClose` or a `canClose` flip does
  // not re-run the effect below. A re-run would bounce focus to the invoker
  // and back while the user is typing.
  const closeRef = useRef({ onClose, canClose });
  useLayoutEffect(() => {
    closeRef.current = { onClose, canClose };
  });

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Captured now, not on cleanup: the invoker may unmount while the dialog is open.
    const invoker = invokerRef?.current ?? null;

    const background = inertSelector ? document.querySelector<HTMLElement>(inertSelector) : null;
    const previousAriaHidden = background?.getAttribute("aria-hidden");
    background?.setAttribute("inert", "");
    background?.setAttribute("aria-hidden", "true");

    const frame = window.requestAnimationFrame(() => {
      const preferred =
        initialFocusRef?.current ??
        containerRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        containerRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      preferred?.focus();
    });

    // Bound to the window rather than the container so a keydown dispatched at
    // either level is handled: dialog-level events bubble up to here.
    const handleKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      if (event.key === "Escape") {
        if (!closeRef.current.canClose) return;
        event.preventDefault();
        closeRef.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // Focus can land outside the dialog (browser chrome, a programmatic
      // blur); pull it back rather than letting Tab walk the page behind.
      if (!container.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      background?.removeAttribute("inert");
      if (previousAriaHidden == null) background?.removeAttribute("aria-hidden");
      else background?.setAttribute("aria-hidden", previousAriaHidden);
      // Synchronous: callers unmount the dialog and assert focus immediately.
      (invoker ?? previouslyFocused)?.focus();
    };
  }, [open, containerRef, invokerRef, initialFocusRef, inertSelector]);
}
