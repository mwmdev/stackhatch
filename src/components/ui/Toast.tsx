"use client";

import { useRef, type MouseEvent } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export type ToastTone = "success" | "error";

export interface ToastMessage {
  tone: ToastTone;
  message: string;
}

export interface ToastProps {
  toast: ToastMessage | null;
  /** Renders the dismiss control. Timing (5 s unless focused) stays with the caller. */
  onDismiss?: () => void;
  "data-testid"?: string;
}

const TONES = {
  success: {
    Icon: CircleCheck,
    // Success is polite; an error interrupts because it usually means the
    // user's last action did not happen.
    live: "polite" as const,
    label: "Success",
  },
  error: {
    Icon: CircleAlert,
    live: "assertive" as const,
    label: "Error",
  },
};

export default function Toast({ toast, onDismiss, "data-testid": testId }: ToastProps) {
  const tone = TONES[toast?.tone ?? "error"];
  const { Icon } = tone;
  // Where focus was before it landed on the dismiss control, so dismissing
  // does not drop focus to <body> when the button unmounts.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  function dismiss(event: MouseEvent<HTMLButtonElement>) {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (document.activeElement === event.currentTarget && target?.isConnected) target.focus();
    onDismiss?.();
  }

  return (
    <div className="toast-region">
      {/* Always rendered so assistive tech observes the live region rather than
          seeing it inserted along with its content. Only tone and message are
          announced; the visible chip below repeats them for sighted users. A
          bare live region rather than role="status"/"alert" so it does not
          shadow the page's own alerts. */}
      <div className="sr-only" aria-live={tone.live} aria-atomic="true">
        {toast ? `${tone.label}: ${toast.message}` : null}
      </div>
      {toast ? (
        <div data-testid={testId} data-tone={toast.tone} className="toast">
          <Icon className="toast__icon" aria-hidden="true" />
          <span className="toast__message" aria-hidden="true">
            {toast.message}
          </span>
          {onDismiss ? (
            <button
              type="button"
              className="toast__dismiss"
              aria-label="Dismiss notification"
              onFocus={(event) => {
                const from = event.relatedTarget;
                returnFocusRef.current = from instanceof HTMLElement ? from : null;
              }}
              onClick={dismiss}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
