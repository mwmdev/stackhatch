import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AppPage from "./page";

vi.mock("@/components/AppResolver", () => ({
  default: () => <div data-testid="app-resolver" />,
}));

describe("AppPage", () => {
  it("renders the browser-side resolver without an account or server lookup", () => {
    render(<AppPage />);
    expect(screen.getByTestId("app-resolver")).toBeInTheDocument();
  });
});
