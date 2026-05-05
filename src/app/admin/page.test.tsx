import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPage from "./page";
import { DEFAULT_PLAN_CATALOG } from "@/lib/plan-config";

function mockAdminFetch() {
  const plans = JSON.parse(JSON.stringify(DEFAULT_PLAN_CATALOG));
  global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url === "/api/admin/users") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }

    if (url === "/api/admin/plans" && options?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ plans: JSON.parse(options.body as string).plans }),
      });
    }

    if (url === "/api/admin/plans") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ plans }),
      });
    }

    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: "Not found" }),
    });
  }) as unknown as typeof global.fetch;
}

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminFetch();
  });

  it("preserves a new blank line while editing marketing bullets", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "Plans" }));

    const bullets = screen.getAllByLabelText("Marketing bullets")[0] as HTMLTextAreaElement;
    fireEvent.change(bullets, { target: { value: "First bullet\n" } });

    expect(bullets.value).toBe("First bullet\n");
  });

  it("trims blank marketing bullet lines before saving", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "Plans" }));

    const bullets = screen.getAllByLabelText("Marketing bullets")[0] as HTMLTextAreaElement;
    fireEvent.change(bullets, { target: { value: " First bullet \n\nSecond bullet\n" } });
    fireEvent.click(screen.getByText("Save plans"));

    await waitFor(() => {
      const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => (call[1] as RequestInit | undefined)?.method === "PATCH"
      );
      expect(patchCall).toBeTruthy();

      const body = JSON.parse((patchCall?.[1] as RequestInit).body as string);
      expect(body.plans.free.bullets).toEqual(["First bullet", "Second bullet"]);
    });
  });
});
