import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CustomSubtypesSettings from "./CustomSubtypesSettings";

const initialCatalog = {
  client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
};

describe("CustomSubtypesSettings", () => {
  it("stages structured edits and saves the whole catalog to the injected browser vault", async () => {
    const saveCatalog = vi.fn(async (catalog) => catalog);
    render(<CustomSubtypesSettings initialCatalog={initialCatalog} saveCatalog={saveCatalog} />);

    const save = screen.getByRole("button", { name: "Save subtype changes" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Client subtype 1 slug"), {
      target: { value: "store-kiosk" },
    });
    fireEvent.change(screen.getByLabelText("Client subtype 1 display name"), {
      target: { value: "Store kiosk" },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(saveCatalog).toHaveBeenCalledWith({
        client: [{ slug: "store-kiosk", displayName: "Store kiosk", icon: "Box" }],
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("saved on this device");
    expect(save).toBeDisabled();
  });

  it("shows a vault failure and restores the last committed catalog", async () => {
    const saveCatalog = vi.fn().mockRejectedValue(new Error("Browser storage is busy"));
    render(<CustomSubtypesSettings initialCatalog={initialCatalog} saveCatalog={saveCatalog} />);
    fireEvent.change(screen.getByLabelText("Client subtype 1 display name"), {
      target: { value: "Changed locally" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subtype changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Browser storage is busy");
    expect(screen.getByLabelText("Client subtype 1 display name")).toHaveValue("Kiosk");
    expect(screen.getByRole("button", { name: "Save subtype changes" })).toBeDisabled();
  });

  it("rejects a non-authoritative saved catalog and restores the committed value", async () => {
    const saveCatalog = vi.fn().mockResolvedValue({
      client: [{ slug: "Not Valid", displayName: "Unsafe", icon: "Box" }],
    });
    render(<CustomSubtypesSettings initialCatalog={initialCatalog} saveCatalog={saveCatalog} />);
    fireEvent.change(screen.getByLabelText("Client subtype 1 display name"), {
      target: { value: "Submitted locally" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save subtype changes" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Client subtype 1 display name")).toHaveValue("Kiosk");
  });

  it("shows field-level validation and does not submit an invalid catalog", () => {
    const saveCatalog = vi.fn();
    render(<CustomSubtypesSettings initialCatalog={initialCatalog} saveCatalog={saveCatalog} />);
    fireEvent.change(screen.getByLabelText("Client subtype 1 slug"), {
      target: { value: "Not Valid" },
    });
    fireEvent.change(screen.getByLabelText("Client subtype 1 icon"), {
      target: { value: "DefinitelyMissing" },
    });

    expect(screen.getByText("Use lowercase kebab-case, up to 40 characters.")).toBeInTheDocument();
    expect(screen.getByText("Enter a supported Lucide icon name.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save subtype changes" })).toBeDisabled();
    expect(saveCatalog).not.toHaveBeenCalled();
  });

  it("adds and removes entries without saving implicitly", () => {
    const saveCatalog = vi.fn();
    render(<CustomSubtypesSettings initialCatalog={initialCatalog} saveCatalog={saveCatalog} />);
    fireEvent.click(screen.getByRole("button", { name: "Add API Layer subtype" }));
    expect(screen.getByLabelText("API Layer subtype 1 slug")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Client subtype 1" }));
    expect(screen.queryByLabelText("Client subtype 1 slug")).not.toBeInTheDocument();
    expect(saveCatalog).not.toHaveBeenCalled();
  });
});
