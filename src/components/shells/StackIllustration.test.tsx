import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StackIllustration from "./StackIllustration";

describe("StackIllustration", () => {
  it("is a clipped, non-interactive architectural decoration", () => {
    const { container } = render(<StackIllustration variant="compact" />);

    const illustrations = container.querySelectorAll('[data-stack-illustration="true"]');
    expect(illustrations).toHaveLength(1);

    const illustration = illustrations[0];
    expect(illustration).toHaveAttribute("aria-hidden", "true");
    expect(illustration).toHaveAttribute("focusable", "false");
    expect(illustration).toHaveStyle({ pointerEvents: "none" });
    expect(illustration.closest('[data-stack-illustration-clip="true"]')).toHaveAttribute(
      "data-variant",
      "compact"
    );
    expect(illustration.querySelectorAll(".stack-illustration__sheet")).toHaveLength(3);
    expect(illustration.querySelectorAll(".stack-illustration__modules path")).toHaveLength(4);
    expect(illustration.querySelectorAll(".stack-illustration__hatch path")).toHaveLength(4);
  });
});
