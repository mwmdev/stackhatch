import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AppPage from "./page";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getDb: vi.fn(() => ({ name: "db" })),
  redirect: vi.fn(),
  resolveProjectResume: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/project-resume", () => ({ resolveProjectResume: mocks.resolveProjectResume }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/AppResolver", () => ({
  default: ({ destination }: { destination: string }) => (
    <div data-testid="app-resolver" data-destination={destination} />
  ),
}));

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const page = await AppPage({ searchParams: Promise.resolve(searchParams) });
  return render(page);
}

describe("AppPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthenticatedUser.mockResolvedValue({
      userId: "subject-user",
      githubId: "github-subject",
    });
  });

  it("resolves the authenticated subject's selected project into a recoverable destination", async () => {
    mocks.resolveProjectResume.mockReturnValue({ id: "remembered-map" });

    await renderPage();

    expect(mocks.resolveProjectResume).toHaveBeenCalledWith({ name: "db" }, "subject-user");
    expect(screen.getByTestId("app-resolver")).toHaveAttribute(
      "data-destination",
      "/project/remembered-map?resume=1"
    );
  });

  it("sends an account with no maps to the canonical new-map chooser", async () => {
    mocks.resolveProjectResume.mockReturnValue(undefined);

    await renderPage();

    expect(screen.getByTestId("app-resolver")).toHaveAttribute("data-destination", "/project/new");
  });

  it("makes the destination after a recovery attempt non-recoverable", async () => {
    mocks.resolveProjectResume.mockReturnValue({ id: "fallback-map" });

    await renderPage({ resumeRecovery: "1" });

    expect(screen.getByTestId("app-resolver")).toHaveAttribute(
      "data-destination",
      "/project/fallback-map"
    );
  });
});
