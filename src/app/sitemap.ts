import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://stackhatch.io";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-07-14T00:00:00.000Z");
  return [
    { url: siteUrl, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/demo`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${siteUrl}/support`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/terms`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
