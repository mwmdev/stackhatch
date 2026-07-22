import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { icons } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  getSupportedLucideIcon,
  isSupportedLucideIcon,
  parseCustomSubtypes,
  serializeCustomSubtypes,
  validateCustomSubtypes,
} from "./custom-subtypes";

const validCatalog = {
  client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Box" }],
  services: [{ slug: "fraud-engine", displayName: "Fraud engine", icon: "ShieldCheck" }],
};

describe("custom subtype codec", () => {
  it("accepts a strictly structured catalog", () => {
    expect(parseCustomSubtypes(JSON.stringify(validCatalog))).toEqual(validCatalog);
    expect(validateCustomSubtypes(validCatalog)).toEqual(validCatalog);
    expect(serializeCustomSubtypes(validCatalog)).toBe(JSON.stringify(validCatalog));
  });

  it("accepts only canonical renderable icons from the Lucide icons map", () => {
    expect(isSupportedLucideIcon("Box")).toBe(true);
    expect(isSupportedLucideIcon("Icon")).toBe(false);
    expect(isSupportedLucideIcon("DefinitelyNotAnIcon")).toBe(false);

    for (const name of Object.keys(icons)) {
      const Icon = getSupportedLucideIcon(name);
      expect(Icon, name).toBeDefined();
      expect(() =>
        renderToStaticMarkup(createElement(Icon!, { size: 16, className: "custom-icon" }))
      ).not.toThrow();
    }
  });

  it("serializes categories in the canonical display order", () => {
    const reversedCatalog = {
      services: validCatalog.services,
      client: validCatalog.client,
    };

    expect(serializeCustomSubtypes(reversedCatalog)).toBe(JSON.stringify(validCatalog));
  });

  it("maps only a missing catalog to an empty map", () => {
    expect(parseCustomSubtypes(undefined)).toEqual({});
    expect(() => parseCustomSubtypes("")).toThrow(/valid JSON/i);
    expect(() => parseCustomSubtypes("not-json")).toThrow(/valid JSON/i);
  });

  it.each([
    [{ unknown: [] }, "unknown category"],
    [{ client: {} }, "array"],
    [{ client: [{ ...validCatalog.client[0], extra: true }] }, "exactly"],
    [{ client: [{ slug: "Not Kebab", displayName: "Kiosk", icon: "Box" }] }, "kebab-case"],
    [{ client: [{ slug: "kiosk", displayName: " Kiosk", icon: "Box" }] }, "trimmed"],
    [{ client: [{ slug: "kiosk", displayName: "Kiosk\nterminal", icon: "Box" }] }, "line breaks"],
    [{ client: [{ slug: "kiosk", displayName: "Kiosk", icon: "DefinitelyNotAnIcon" }] }, "Lucide"],
    [{ client: [{ slug: "kiosk", displayName: "Kiosk", icon: "Icon" }] }, "Lucide"],
    [{ client: [{ slug: "web-app", displayName: "Web", icon: "Box" }] }, "built-in"],
    [
      {
        client: [validCatalog.client[0], { ...validCatalog.client[0], displayName: "Duplicate" }],
      },
      "unique",
    ],
    [
      {
        client: Array.from({ length: 21 }, (_, index) => ({
          slug: `custom-${index}`,
          displayName: `Custom ${index}`,
          icon: "Box",
        })),
      },
      "20",
    ],
  ])("rejects invalid catalog %#", (catalog, message) => {
    expect(() => parseCustomSubtypes(JSON.stringify(catalog))).toThrow(message);
  });
});
