import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RoutingTrace from "./RoutingTrace";

describe("RoutingTrace", () => {
  it("is a single clipped, non-interactive decoration", () => {
    const { container } = render(<RoutingTrace variant="compact" />);

    const traces = container.querySelectorAll('[data-routing-trace="true"]');
    expect(traces).toHaveLength(1);

    const trace = traces[0];
    expect(trace).toHaveAttribute("aria-hidden", "true");
    expect(trace).toHaveAttribute("focusable", "false");
    expect(trace).toHaveStyle({ pointerEvents: "none" });
    expect(trace.closest('[data-routing-trace-clip="true"]')).toHaveAttribute(
      "data-variant",
      "compact"
    );
    expect(trace.querySelectorAll("path")).toHaveLength(1);
  });
});
