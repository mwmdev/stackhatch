import { describe, expect, it } from "vitest";
import {
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
