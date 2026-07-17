import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPage from "./page";

function mockAdminFetch() {
  const settings = { customSubtypes: "", prompt_chat: "", prompt_alternatives: "", prompt_prd: "" };
  global.fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    if (url === "/api/admin/users" && !options?.method) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "u1",
              githubId: "123",
              email: "user@example.com",
              name: "User One",
              role: "user",
              createdAt: 1,
            },
          ]),
      });
    }
    if (url === "/api/admin/settings" && options?.method === "PATCH") {
      Object.assign(settings, JSON.parse(options.body as string));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(settings) });
    }
    if (url === "/api/admin/settings")
      return Promise.resolve({ ok: true, json: () => Promise.resolve(settings) });
    if (url === "/api/admin/users" && options?.method === "PATCH")
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "Not found" }) });
  }) as unknown as typeof global.fetch;
}

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminFetch();
  });

  it("shows only permission and content administration tabs", async () => {
    render(<AdminPage />);
    await screen.findByRole("tab", { name: "Users" });
    expect(screen.getByRole("tab", { name: "Node Subtypes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Prompts" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Plans" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Model" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1, name: "Admin" })).toHaveLength(1);
    expect(screen.getByRole("main").closest(".app-page-shell")).toHaveAttribute(
      "data-density",
      "dense"
    );
    expect(screen.getByTestId("admin-users-table-scroll")).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("table")).toHaveClass("min-w-[44rem]");
  });

  it("keeps loading and denied states inside the dense authenticated shell", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/users") {
        return Promise.resolve({ status: 403, ok: false, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }) as unknown as typeof global.fetch;

    render(<AdminPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading admin workspace");
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Resume map" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("main").closest(".app-page-shell")).toHaveAttribute(
      "data-density",
      "dense"
    );
  });

  it("labels /app as resume navigation instead of a dashboard", async () => {
    render(<AdminPage />);

    expect(await screen.findByRole("link", { name: "Resume map" })).toHaveAttribute("href", "/app");
  });

  it("offers only user and admin roles", async () => {
    render(<AdminPage />);
    const role = await screen.findByLabelText("Role for User One");
    expect(Array.from((role as HTMLSelectElement).options).map((option) => option.value)).toEqual([
      "user",
      "admin",
    ]);
  });

  it("adds custom node subtypes", async () => {
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "Node Subtypes" }));
    fireEvent.change(screen.getAllByPlaceholderText("slug")[0], { target: { value: "kiosk" } });
    fireEvent.change(screen.getAllByPlaceholderText("Display Name")[0], {
      target: { value: "Kiosk" },
    });
    fireEvent.click(screen.getAllByText("Add")[0]);
    await waitFor(() =>
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) =>
            call[0] === "/api/admin/settings" &&
            (call[1] as RequestInit | undefined)?.method === "PATCH" &&
            JSON.parse((call[1] as RequestInit).body as string).customSubtypes
        )
      ).toBe(true)
    );
  });

  it("saves prompts", async () => {
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "Prompts" }));
    const textarea = screen.getByDisplayValue(/You are a senior application architect/);
    fireEvent.change(textarea, { target: { value: "Custom chat prompt" } });
    fireEvent.click(screen.getByText("Save prompt"));
    await waitFor(() =>
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) =>
            call[0] === "/api/admin/settings" &&
            (call[1] as RequestInit | undefined)?.method === "PATCH" &&
            JSON.parse((call[1] as RequestInit).body as string).prompt_chat === "Custom chat prompt"
        )
      ).toBe(true)
    );
  });
});
