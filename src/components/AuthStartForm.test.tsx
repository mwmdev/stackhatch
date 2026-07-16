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
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/login");
  });

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

  it("canonicalizes an inherited legacy start fragment before sign-in", () => {
    window.history.replaceState({}, "", "/login?callbackUrl=%2Fapp#start");
    render(
      <AuthStartForm action={vi.fn()} callbackUrl="/app">
        <button type="submit">Continue</button>
      </AuthStartForm>
    );

    fireEvent.submit(screen.getByRole("button", { name: "Continue" }).closest("form")!);

    expect(document.querySelector<HTMLInputElement>('input[name="callbackUrl"]')).toHaveValue(
      "/project/new"
    );
  });
});
