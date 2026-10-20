import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Archivo: () => ({ variable: "font-display" }),
  Atkinson_Hyperlegible_Next: () => ({ variable: "font-body" }),
  IBM_Plex_Mono: () => ({ variable: "font-utility" }),
}));

import { metadata } from "./layout";

describe("RootLayout metadata", () => {
  it("truthfully labels the StackHatch self-architecture Open Graph image", () => {
    expect(metadata.openGraph).toMatchObject({
      images: [
        {
          url: "/screenshots/architecture-overview-og.png",
          alt: "StackHatch's own architecture as a map in the StackHatch editor, with the AI assistant reaching the Anthropic, OpenAI, Google Gemini and OpenRouter APIs",
        },
      ],
    });
  });

  it("describes the editable, local-first product contract", () => {
    expect(metadata.description).toContain("GitHub repositories, public or private,");
    expect(metadata.description).toContain("Markdown requirements");
    expect(metadata.description).toContain("editable architecture maps");
    expect(metadata.description).toContain("Local-first, accountless");
  });
});
