import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

describe("Testing Library smoke test", () => {
  it("renders and finds text content", () => {
    render(<div>hello</div>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
