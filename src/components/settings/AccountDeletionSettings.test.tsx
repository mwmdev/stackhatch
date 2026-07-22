import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountDeletionSettings from "./AccountDeletionSettings";

const available = { enabled: true };

function stageDeletion(onDeleted: () => void | Promise<void> = vi.fn()) {
  render(<AccountDeletionSettings availability={available} onDeleted={onDeleted} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  fireEvent.change(screen.getByLabelText(/Type DELETE MY ACCOUNT/), {
    target: { value: "DELETE MY ACCOUNT" },
  });
  return onDeleted;
}

describe("AccountDeletionSettings", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires the exact phrase, supports cancel, and returns focus to the trigger", async () => {
    const onDeleted = vi.fn();
    render(<AccountDeletionSettings availability={available} onDeleted={onDeleted} />);
    const trigger = screen.getByRole("button", { name: "Delete account" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Permanently delete your account?" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/projects and architecture maps/)).toBeInTheDocument();
    expect(screen.getByText(/SQLite WAL files and backups follow/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Type DELETE MY ACCOUNT/), {
      target: { value: "delete my account" },
    });
    expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("closes with Escape and restores focus to the trigger", async () => {
    render(<AccountDeletionSettings availability={available} onDeleted={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Delete account" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Permanently delete your account?" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("disables deletion and explains why when the server marks it unavailable", () => {
    render(
      <AccountDeletionSettings
        availability={{ enabled: false, reason: "Unavailable in development mode." }}
      />
    );

    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Unavailable in development mode.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("locks duplicate submission and enters a permanent committed state", async () => {
    let resolveRequest!: (response: Response) => void;
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => (resolveRequest = resolve)));
    const onDeleted = stageDeletion();
    const submit = screen.getByRole("button", { name: "Permanently delete account" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Deleting account..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onDeleted).not.toHaveBeenCalled();
    const pendingDialog = screen.getByRole("dialog", {
      name: "Permanently delete your account?",
    });
    expect(fireEvent.keyDown(pendingDialog, { key: "Tab" })).toBe(false);
    expect(pendingDialog).toHaveFocus();

    resolveRequest(
      new Response(JSON.stringify({ committed: true, deleted: true, signedOut: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Account deleted" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("account deletion committed");
    expect(screen.getByRole("link", { name: "Return to StackHatch home" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it.each([
    ["returns", () => undefined],
    [
      "throws",
      () => {
        throw new Error("navigation failed");
      },
    ],
  ])("keeps the committed fallback when navigation %s", async (_name, onDeleted) => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ committed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    stageDeletion(onDeleted);
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("status")).toHaveTextContent("account deletion committed");
    expect(screen.getByRole("button", { name: "Account deleted" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("preserves a safe API rejection and allows an intentional retry", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Account deletion is temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })
    );
    stageDeletion();
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Account deletion is temporarily unavailable"
    );
    expect(screen.getByLabelText(/Type DELETE MY ACCOUNT/)).toHaveValue("DELETE MY ACCOUNT");
    expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeEnabled();
  });

  it("treats response loss followed by a 401 identity probe as committed", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const onDeleted = stageDeletion();
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/me", { cache: "no-store" });
    expect(screen.getByRole("button", { name: "Account deleted" })).toBeDisabled();
  });

  it("treats invalid success JSON followed by a reachable identity as retryable", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ userId: "user-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    stageDeletion();
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/account is still active/i);
    expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeEnabled();
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/me", { cache: "no-store" });
  });

  it("locks blind retries when an ambiguous result cannot be reconciled", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("connection lost"))
      .mockRejectedValueOnce(new TypeError("probe failed"));
    stageDeletion();
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not confirm/i);
    expect(screen.getByRole("button", { name: "Deletion status unknown" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Reload settings to check your account" })
    ).toHaveAttribute("href", "/settings");
  });
});
