"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { useFocusTrap } from "./useFocusTrap";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Required: every dialog needs an accessible name. */
  title: string;
  /** Id for the title, so body content can be labelled by it. */
  titleId?: string;
  children: ReactNode;
  /** Rendered right-aligned under the body; the destructive action goes last, `btn--danger-solid`. */
  footer?: ReactNode;
  /** Focus returns here on close. */
  invokerRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** When false, Escape and scrim clicks are ignored. */
  canClose?: boolean;
  /** Marked inert while open, for surfaces that are not already covered. */
  inertSelector?: string;
  /** `md` is the 480 px default; `sm` is 384 px for one-sentence confirmations. */
  size?: "sm" | "md";
  "data-testid"?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  titleId: titleIdProp,
  children,
  footer,
  invokerRef,
  initialFocusRef,
  canClose = true,
  inertSelector,
  size = "md",
  "data-testid": testId,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const generatedTitleId = `modal-title-${useId()}`;
  const titleId = titleIdProp ?? generatedTitleId;

  useFocusTrap({
    open,
    onClose,
    containerRef: dialogRef,
    invokerRef,
    initialFocusRef,
    canClose,
    inertSelector,
  });

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => canClose && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        data-size={size}
        className="modal"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        <div className="modal__body">{children}</div>
        {footer ? <div className="modal__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
