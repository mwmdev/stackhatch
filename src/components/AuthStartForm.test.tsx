import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthStartForm from "./AuthStartForm";

const { mockMarkAuthenticationStarted, mockTrackEvent } = vi.hoisted(() => ({
  mockMarkAuthenticationStarted: vi.fn(),
  mockTrackEvent: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  markAuthenticationStarted: mockMarkAuthenticationStarted,
  trackEvent: mockTrackEvent,
}));

describe("AuthStartForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves and tracks the privacy-safe start method when authentication begins", () => {
    render(
      <AuthStartForm action={vi.fn()} startMethod="template">
        <button type="submit">Continue</button>
      </AuthStartForm>
    );

    fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!);

    expect(mockMarkAuthenticationStarted).toHaveBeenCalledWith("template");
    expect(mockTrackEvent).toHaveBeenCalledWith("github_auth_started", {
      location: "login",
      start_method: "template",
    });
  });
});
