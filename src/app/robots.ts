import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://stackhatch.io";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo", "/support", "/privacy", "/terms"],
      disallow: [
        "/api/",
        "/admin",
        "/app",
        "/invite/",
        "/login",
        "/project/",
        "/settings",
        "/team/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
