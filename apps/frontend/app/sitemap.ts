import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  return url ? [{ url: new URL("/", url).toString(), changeFrequency: "monthly", priority: 1 }] : [];
}
