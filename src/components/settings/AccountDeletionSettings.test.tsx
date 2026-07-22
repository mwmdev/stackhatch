import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountDeletionSettings from "./AccountDeletionSettings";

describe("AccountDeletionSettings", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires the exact phrase, supports cancel, and returns focus to the trigger", async () => {
    const onDeleted = vi.fn();
    render(<AccountDeletionSettings onDeleted={onDeleted} />);
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
    render(<AccountDeletionSettings onDeleted={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Delete account" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Permanently delete your account?" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("locks duplicate submission and redirects only after a committed result", async () => {
    let resolveRequest!: (response: Response) => void;
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => (resolveRequest = resolve)));
    const onDeleted = vi.fn();
    render(<AccountDeletionSettings onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.change(screen.getByLabelText(/Type DELETE MY ACCOUNT/), {
      target: { value: "DELETE MY ACCOUNT" },
    });
    const submit = screen.getByRole("button", { name: "Permanently delete account" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Deleting account..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onDeleted).not.toHaveBeenCalled();

    resolveRequest(
      new Response(JSON.stringify({ committed: true, deleted: true, signedOut: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("announces a retryable failure and keeps the confirmation staged", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Account deletion failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    );
    render(<AccountDeletionSettings onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const input = screen.getByLabelText(/Type DELETE MY ACCOUNT/);
    fireEvent.change(input, { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not deleted.*try again/i);
    expect(input).toHaveValue("DELETE MY ACCOUNT");
    expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeEnabled();
  });
});
