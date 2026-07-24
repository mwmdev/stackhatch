import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "font-display" }),
  Atkinson_Hyperlegible: () => ({ variable: "font-body" }),
  IBM_Plex_Mono: () => ({ variable: "font-utility" }),
}));

import { metadata } from "./layout";

describe("RootLayout metadata", () => {
  it("truthfully labels the synthetic Open Graph reference architecture", () => {
    expect(metadata.openGraph).toMatchObject({
      images: [
        {
          url: "/screenshots/architecture-overview-og.png",
          alt: "Synthetic Customer Portal reference architecture in the real StackHatch editor",
        },
      ],
    });
  });

  it("describes the local-first and direct-provider boundary", () => {
    expect(metadata.description).toContain("Maps stay in your browser");
    expect(metadata.description).toContain("directly to providers");
  });
});
