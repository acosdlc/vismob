import type { MetadataRoute } from "next";
import { getProjects, type Project } from "@/lib/data/projects";
import { siteUrl } from "@/lib/site-url";

// ARHITECTURA §10: the sitemap, „inclusiv lucrările”. There are no project pages
// (DESIGN §4.4: /lucrari is one gallery), so the projects enter as the image
// sitemap of /lucrari, the first photo of each published project. Nothing real
// exists for lastModified, changeFrequency or priority, so none is written.
// Generated at build time; getProjects() serves its seed without Supabase.

/** Every indexable route. The panel and the API are disallowed in robots.ts. */
export const PUBLIC_ROUTES = [
  "/",
  "/lucrari",
  "/materiale",
  "/configurator",
  "/contact",
  "/confidentialitate",
  "/cookies",
  "/termeni",
] as const;

/** Pure: the entries for `base` (the origin, no trailing slash) and the published projects. */
export function sitemapEntries(base: string, projects: readonly Project[]): MetadataRoute.Sitemap {
  const photos = projects.map((p) => p.photo?.src).filter((src): src is string => src !== undefined);
  const images = [...new Set(photos)];
  return PUBLIC_ROUTES.map((path) => {
    const url = `${base}${path}`;
    return path === "/lucrari" && images.length > 0 ? { url, images } : { url };
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return sitemapEntries(siteUrl(), await getProjects());
}
