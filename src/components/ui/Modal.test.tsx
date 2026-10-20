import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Modal from "./Modal";

function nextFrame() {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => resolve());
  return promise;
}

function Harness({
  canClose,
  onClose,
  withInvoker = true,
}: {
  canClose?: boolean;
  onClose?: () => void;
  withInvoker?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const invokerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button" ref={invokerRef} onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Behind the dialog</button>
      <Modal
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        canClose={canClose}
        title="Delete this map?"
        invokerRef={withInvoker ? invokerRef : undefined}
        footer={
          <>
            <button type="button" data-autofocus>
              Cancel
            </button>
            <button type="button">Confirm</button>
          </>
        }
      >
        <p>Body copy</p>
      </Modal>
    </>
  );
}

/** A dialog whose field and busy state live in the parent, with an inline onClose. */
function RerenderingHarness() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const invokerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button" ref={invokerRef} onClick={() => setOpen(true)}>
        Open
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        canClose={!busy}
        title="Rename map"
        invokerRef={invokerRef}
        footer={
          <button type="button" onClick={() => setBusy(true)}>
            Save
          </button>
        }
      >
        <input aria-label="Map name" value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </>
  );
}

describe("Modal", () => {
  it("names the dialog and moves focus to the autofocus target on open", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Delete this map?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("closes on Escape and returns focus to the invoker", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const invoker = screen.getByRole("button", { name: "Open" });
    fireEvent.click(invoker);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(invoker).toHaveFocus();
  });

  it("ignores Escape while the action cannot be cancelled", async () => {
    const onClose = vi.fn();
    render(<Harness canClose={false} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("wraps Tab within the dialog", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    await waitFor(() => expect(cancel).toHaveFocus());

    // Backwards off the first control lands on the last, not on the page behind.
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(cancel).toHaveFocus();
  });

  it("recovers focus that escaped the dialog", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());

    screen.getByRole("button", { name: "Behind the dialog" }).focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("falls back to the previously focused element when there is no invoker", async () => {
    render(<Harness withInvoker={false} />);
    const invoker = screen.getByRole("button", { name: "Open" });
    invoker.focus();
    fireEvent.click(invoker);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(invoker).toHaveFocus());
  });

  it("keeps focus in the field while typing re-renders the parent", async () => {
    render(<RerenderingHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const field = await screen.findByRole("textbox", { name: "Map name" });
    await waitFor(() => expect(field).toHaveFocus());
    const invoker = screen.getByRole("button", { name: "Open" });
    const blurred = vi.fn();
    field.addEventListener("blur", blurred);

    fireEvent.change(field, { target: { value: "Checkout" } });
    fireEvent.change(field, { target: { value: "Checkout rewrite" } });
    await nextFrame();

    // Focus must not visit the invoker behind the dialog, even for a frame.
    expect(blurred).not.toHaveBeenCalled();
    expect(invoker).not.toHaveFocus();
    expect(field).toHaveFocus();
    expect(field).toHaveValue("Checkout rewrite");
  });

  it("keeps focus inside when the action locks closing, and still ignores Escape", async () => {
    render(<RerenderingHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Map name" })).toHaveFocus());

    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.click(save);
    await nextFrame();

    expect(save).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Rename map" })).toBeInTheDocument();
  });
});
