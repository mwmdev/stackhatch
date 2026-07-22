import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomSubtypesSettings from "./CustomSubtypesSettings";

const initialCatalog = {
  client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
};

describe("CustomSubtypesSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stages structured edits and saves the whole catalog explicitly", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            customSubtypes: {
              client: [{ slug: "store-kiosk", displayName: "Store kiosk", icon: "Box" }],
            },
          }),
      } as Response)
    ) as unknown as typeof global.fetch;

    render(<CustomSubtypesSettings initialCatalog={initialCatalog} />);

    const save = screen.getByRole("button", { name: "Save subtype changes" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Client subtype 1 slug"), {
      target: { value: "store-kiosk" },
    });
    fireEvent.change(screen.getByLabelText("Client subtype 1 display name"), {
      target: { value: "Store kiosk" },
    });
    expect(save).toBeEnabled();

    fireEvent.click(save);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customSubtypes: {
            client: [{ slug: "store-kiosk", displayName: "Store kiosk", icon: "Box" }],
          },
        }),
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Subtype changes saved");
    expect(save).toBeDisabled();
  });

  it("announces a PATCH failure and restores the last confirmed catalog", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "Database is busy" }),
      } as Response)
    ) as unknown as typeof global.fetch;

    render(<CustomSubtypesSettings initialCatalog={initialCatalog} />);
    fireEvent.change(screen.getByLabelText("Client subtype 1 display name"), {
      target: { value: "Changed locally" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subtype changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Database is busy");
    expect(screen.getByLabelText("Client subtype 1 display name")).toHaveValue("Kiosk");
    expect(screen.getByRole("button", { name: "Save subtype changes" })).toBeDisabled();
  });

  it("reconciles an ambiguous PATCH response from the authoritative settings catalog", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            customSubtypes: {
              client: [{ slug: "kiosk", displayName: "Committed remotely", icon: "Box" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );

    render(<CustomSubtypesSettings initialCatalog={initialCatalog} />);
    fireEvent.change(screen.getByLabelText("Client subtype 1 display name"), {
      target: { value: "Submitted locally" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subtype changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /saved subtype settings were reloaded/i
    );
    expect(screen.getByLabelText("Client subtype 1 display name")).toHaveValue(
      "Committed remotely"
    );
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/settings", { cache: "no-store" });
    expect(screen.getByRole("button", { name: "Save subtype changes" })).toBeDisabled();
  });

  it("keeps editing locked when an ambiguous PATCH cannot be reconciled", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockRejectedValueOnce(new TypeError("refresh failed"));

    render(<CustomSubtypesSettings initialCatalog={initialCatalog} />);
    fireEvent.change(screen.getByLabelText("Client subtype 1 display name"), {
      target: { value: "Possibly committed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subtype changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not confirm whether/i);
    expect(screen.getByRole("button", { name: "Reload settings to continue" })).toBeDisabled();
    expect(screen.getByLabelText("Client subtype 1 display name")).toBeDisabled();
    expect(global.fetch).toHaveBeenNthCalledWith(2, "/api/settings", { cache: "no-store" });
  });

  it("shows field-level validation and does not submit an invalid catalog", async () => {
    global.fetch = vi.fn();
    render(<CustomSubtypesSettings initialCatalog={initialCatalog} />);

    fireEvent.change(screen.getByLabelText("Client subtype 1 slug"), {
      target: { value: "Not Valid" },
    });
    fireEvent.change(screen.getByLabelText("Client subtype 1 icon"), {
      target: { value: "DefinitelyMissing" },
    });

    expect(screen.getByText("Use lowercase kebab-case, up to 40 characters.")).toBeInTheDocument();
    expect(screen.getByText("Enter a supported Lucide icon name.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save subtype changes" })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("adds and removes entries without saving implicitly", () => {
    global.fetch = vi.fn();
    render(<CustomSubtypesSettings initialCatalog={initialCatalog} />);

    fireEvent.click(screen.getByRole("button", { name: "Add API Layer subtype" }));
    expect(screen.getByLabelText("API Layer subtype 1 slug")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove Client subtype 1" }));
    expect(screen.queryByLabelText("Client subtype 1 slug")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
