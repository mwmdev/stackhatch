import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import Toast from "./Toast";

describe("Toast", () => {
  it("announces only the tone and message, not the dismiss control", () => {
    render(
      <Toast toast={{ tone: "error", message: "Save failed." }} onDismiss={() => undefined} />
    );

    const live = document.querySelector("[aria-live]");
    expect(live).toHaveAttribute("aria-live", "assertive");
    expect(live).toHaveTextContent("Error: Save failed.");
    expect(live).not.toContainElement(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(live).not.toHaveTextContent("Dismiss");
  });

  it("returns focus to the previously focused control when dismissed", () => {
    function Host() {
      const [toast, setToast] = useState<{ tone: "success"; message: string } | null>({
        tone: "success",
        message: "Saved.",
      });
      return (
        <>
          <button type="button">Before</button>
          <Toast toast={toast} onDismiss={() => setToast(null)} />
        </>
      );
    }
    render(<Host />);
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();
    screen.getByRole("button", { name: "Dismiss notification" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    expect(screen.queryByRole("button", { name: "Dismiss notification" })).not.toBeInTheDocument();
    expect(before).toHaveFocus();
  });
});
