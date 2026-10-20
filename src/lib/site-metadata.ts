import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.stackhatch.io";

const OG_IMAGE = {
  url: "/screenshots/architecture-overview-og.png",
  width: 1200,
  height: 630,
  alt: "StackHatch's own architecture as a map in the StackHatch editor, with the AI assistant reaching the Anthropic, OpenAI, Google Gemini and OpenRouter APIs",
};

export function shareMetadata(
  title: string,
  description: string
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: { type: "website", siteName: "StackHatch", title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}
