import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPage from "./page";
import { DEFAULT_PLAN_CATALOG } from "@/lib/plan-config";

function mockAdminFetch() {
  const plans = JSON.parse(JSON.stringify(DEFAULT_PLAN_CATALOG));
  const adminSettings = {
    model: "claude-sonnet-4-20250514",
    customSubtypes: "",
    prompt_chat: "",
    prompt_alternatives: "",
    prompt_prd: "",
  };
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

    if (url === "/api/admin/settings" && options?.method === "PATCH") {
      Object.assign(adminSettings, JSON.parse(options.body as string));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(adminSettings),
      });
    }

    if (url === "/api/admin/settings") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(adminSettings),
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

  it("saves the admin model setting", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "Model" }));
    fireEvent.change(screen.getByLabelText("Claude Model"), {
      target: { value: "claude-opus-4-20250514" },
    });
    fireEvent.click(screen.getByText("Save model"));

    await waitFor(() => {
      const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) =>
          call[0] === "/api/admin/settings" &&
          (call[1] as RequestInit | undefined)?.method === "PATCH" &&
          JSON.parse((call[1] as RequestInit).body as string).model
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it("adds custom node subtypes from the admin tab", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "Node Subtypes" }));
    const slug = screen.getAllByPlaceholderText("slug")[0];
    const displayName = screen.getAllByPlaceholderText("Display Name")[0];
    fireEvent.change(slug, { target: { value: "kiosk" } });
    fireEvent.change(displayName, { target: { value: "Kiosk" } });
    fireEvent.click(screen.getAllByText("Add")[0]);

    await waitFor(() => {
      const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) =>
          call[0] === "/api/admin/settings" &&
          (call[1] as RequestInit | undefined)?.method === "PATCH" &&
          JSON.parse((call[1] as RequestInit).body as string).customSubtypes
      );
      expect(patchCall).toBeTruthy();

      const body = JSON.parse((patchCall?.[1] as RequestInit).body as string);
      expect(JSON.parse(body.customSubtypes).client).toEqual([
        { slug: "kiosk", displayName: "Kiosk", icon: "Box" },
      ]);
    });
  });

  it("saves prompts from the admin tab", async () => {
    render(<AdminPage />);

    fireEvent.click(await screen.findByRole("tab", { name: "Prompts" }));
    const textarea = screen.getByDisplayValue(/You are a senior application architect/);
    fireEvent.change(textarea, { target: { value: "Custom chat prompt" } });
    fireEvent.click(screen.getByText("Save prompt"));

    await waitFor(() => {
      const patchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) =>
          call[0] === "/api/admin/settings" &&
          (call[1] as RequestInit | undefined)?.method === "PATCH" &&
          JSON.parse((call[1] as RequestInit).body as string).prompt_chat
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall?.[1] as RequestInit).body as string);
      expect(body.prompt_chat).toBe("Custom chat prompt");
    });
  });
});
