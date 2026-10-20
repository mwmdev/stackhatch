import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AllMapsRoute from "./page";

vi.mock("@/components/AllMapsPage", () => ({
  default: () => <div data-testid="all-maps-page" />,
}));

describe("AllMapsRoute", () => {
  it("renders the local map library without authentication", () => {
    render(<AllMapsRoute />);
    expect(screen.getByTestId("all-maps-page")).toBeInTheDocument();
  });
});
