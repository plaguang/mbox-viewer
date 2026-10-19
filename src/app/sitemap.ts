import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://mbox-viewer.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/open-mbox-file", "/mbox-to-pdf", "/mbox-to-csv"];
  return routes.map((r) => ({
    url: `${BASE}${r}`,
    lastModified: "2026-10-19",
    changeFrequency: "weekly",
    priority: r === "" ? 1.0 : 0.9,
  }));
}
