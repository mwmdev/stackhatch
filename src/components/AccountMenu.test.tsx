import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountMenu, { AccountSessionExpiredError } from "./AccountMenu";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("next-auth/react", () => ({ signOut }));

function mockIdentity(identity: { name?: string | null; email?: string | null }) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(identity),
    } as Response)
  ) as unknown as typeof fetch;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function accountPanel() {
  return within(screen.getByTestId("account-popover"));
}

function signOutButton() {
  return accountPanel().getByRole("button", { name: "Sign out", hidden: true });
}

function settingsLink() {
  return accountPanel().getByRole("link", { name: "Settings", hidden: true });
}

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdentity({ name: "Free Customer", email: "free@example.com" });
    signOut.mockResolvedValue(undefined);
  });

  it("renders a stable Account trigger and native disclosure with full identity", async () => {
    render(<AccountMenu />);

    const trigger = screen.getByRole("button", { name: "Account" });
    expect(trigger).toHaveAttribute("popovertarget");
    expect(trigger).toHaveTextContent("U");

    expect(await screen.findByText("Free Customer")).toBeInTheDocument();
    expect(screen.getByText("free@example.com")).toBeInTheDocument();
    expect(trigger).toHaveTextContent("F");
    expect(screen.getByTestId("account-popover")).toHaveAttribute("popover", "auto");
    expect(settingsLink()).toHaveAttribute("href", "/settings");
    expect(signOutButton()).toBeInTheDocument();
    expect(screen.queryByText(/Profile|Billing|Teams/)).not.toBeInTheDocument();
  });

  it.each([
    [{ name: null, email: "person@example.com" }, "Name unavailable", "person@example.com", "P"],
    [{ name: "Person", email: null }, "Person", "Email unavailable", "P"],
    [{ name: null, email: null }, "Name unavailable", "Email unavailable", "U"],
  ])("renders truthful partial identity fallbacks", async (identity, name, email, initial) => {
    mockIdentity(identity);
    render(<AccountMenu />);

    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.getByText(email)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account" })).toHaveTextContent(initial);
  });

  it.each(["non-OK", "rejected"])(
    "keeps account actions available when identity loading is %s",
    async (failure) => {
      global.fetch = vi.fn(() =>
        failure === "non-OK"
          ? Promise.resolve({ ok: false } as Response)
          : Promise.reject(new Error("offline"))
      ) as unknown as typeof fetch;

      render(<AccountMenu />);

      expect(await screen.findByText("Identity unavailable")).toBeInTheDocument();
      expect(settingsLink()).toHaveAttribute("href", "/settings");
      expect(signOutButton()).toBeInTheDocument();
    }
  );

  it("ignores an identity response after unmount", async () => {
    const request = deferred<Response>();
    global.fetch = vi.fn(() => request.promise) as unknown as typeof fetch;
    const { unmount } = render(<AccountMenu />);

    unmount();
    await act(async () => {
      request.resolve({
        ok: true,
        json: () => Promise.resolve({ name: "Late User", email: "late@example.com" }),
      } as Response);
      await request.promise;
    });

    expect(screen.queryByText("Late User")).not.toBeInTheDocument();
  });

  it("preserves long unbroken identity text while allowing it to wrap", async () => {
    const longName = "A".repeat(180);
    const longEmail = `${"b".repeat(160)}@example.com`;
    mockIdentity({ name: longName, email: longEmail });
    render(<AccountMenu />);

    const name = await screen.findByText(longName);
    expect(name).toHaveClass("[overflow-wrap:anywhere]");
    expect(screen.getByText(longEmail)).toHaveClass("[overflow-wrap:anywhere]");
    expect(screen.getByTestId("account-popover").className).toContain("max-w-[calc(100vw-2rem)]");
  });

  it("marks Settings as current only when requested", async () => {
    const { rerender } = render(<AccountMenu settingsActive />);
    await screen.findByText("Free Customer");
    expect(settingsLink()).toHaveAttribute("aria-current", "page");

    rerender(<AccountMenu settingsActive={false} />);
    expect(settingsLink()).not.toHaveAttribute("aria-current");
  });

  it("signs out directly to the public landing page on a clean surface", async () => {
    render(<AccountMenu />);

    fireEvent.click(signOutButton());

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" }));
  });

  it("awaits pre-sign-out work before invoking Auth.js", async () => {
    const save = deferred<void>();
    const beforeSignOut = vi.fn(() => save.promise);
    render(<AccountMenu beforeSignOut={beforeSignOut} />);

    fireEvent.click(signOutButton());

    expect(beforeSignOut).toHaveBeenCalledOnce();
    expect(accountPanel().getByRole("status", { hidden: true })).toHaveTextContent(
      "Saving changes…"
    );
    expect(signOutButton()).toHaveAttribute("aria-disabled", "true");
    expect(signOut).not.toHaveBeenCalled();

    save.resolve();
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" }));
    expect(accountPanel().getByRole("status", { hidden: true })).toHaveTextContent("Signing out…");
  });

  it("prevents duplicate sign-out activation while work is pending", () => {
    const save = deferred<void>();
    const beforeSignOut = vi.fn(() => save.promise);
    render(<AccountMenu beforeSignOut={beforeSignOut} />);

    const button = signOutButton();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(beforeSignOut).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("keeps a blocked Sign out focusable and explains the reason", () => {
    render(<AccountMenu signOutBlockedReason="Architecture update in progress" />);

    const button = signOutButton();
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Architecture update in progress");

    fireEvent.click(button);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("keeps the session active and exposes retry when the save callback fails", async () => {
    const beforeSignOut = vi
      .fn()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce(undefined);
    const onSignOutFailure = vi.fn();
    render(<AccountMenu beforeSignOut={beforeSignOut} onSignOutFailure={onSignOutFailure} />);

    fireEvent.click(signOutButton());

    await waitFor(() =>
      expect(accountPanel().getByRole("alert", { hidden: true })).toHaveTextContent(
        "We couldn’t save your changes. You’re still signed in. Try again."
      )
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(onSignOutFailure).toHaveBeenCalledOnce();
    expect(signOutButton()).not.toHaveAttribute("aria-disabled");

    fireEvent.click(signOutButton());
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
  });

  it("restores a retryable state and invokes recovery when Auth.js rejects", async () => {
    signOut.mockRejectedValueOnce(new Error("auth unavailable")).mockResolvedValueOnce(undefined);
    const onSignOutFailure = vi.fn();
    render(<AccountMenu onSignOutFailure={onSignOutFailure} />);

    fireEvent.click(signOutButton());

    await waitFor(() =>
      expect(accountPanel().getByRole("alert", { hidden: true })).toHaveTextContent(
        "We couldn’t sign you out. You’re still signed in. Try again."
      )
    );
    expect(onSignOutFailure).toHaveBeenCalledOnce();

    fireEvent.click(signOutButton());
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
  });

  it("preserves the original tab and offers same-project reauthentication after expiry", async () => {
    const beforeSignOut = vi.fn(() =>
      Promise.reject(
        new AccountSessionExpiredError("/api/auth/signin?callbackUrl=%2Fproject%2Fproject-1")
      )
    );
    render(<AccountMenu beforeSignOut={beforeSignOut} />);

    fireEvent.click(signOutButton());

    await waitFor(() =>
      expect(accountPanel().getByRole("alert", { hidden: true })).toHaveTextContent(
        "Your session expired before changes could be saved. Keep this tab open."
      )
    );
    const signInLink = accountPanel().getByRole("link", {
      name: "Sign in in a new tab",
      hidden: true,
    });
    expect(signInLink).toHaveAttribute(
      "href",
      "/api/auth/signin?callbackUrl=%2Fproject%2Fproject-1"
    );
    expect(signInLink).toHaveAttribute("target", "_blank");
    expect(signOut).not.toHaveBeenCalled();
  });
});
