import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AllMapsRoute from "./page";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/AllMapsPage", () => ({
  default: () => <div data-testid="all-maps-page" />,
}));

describe("AllMapsRoute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the map library for an authenticated user", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ userId: "user-1", githubId: "github-1" });

    render(await AllMapsRoute());

    expect(screen.getByTestId("all-maps-page")).toBeInTheDocument();
  });

  it("keeps the library authenticated", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(AllMapsRoute()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?callbackUrl=%2Fapp%2Fmaps");
  });
});
