import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

// ARHITECTURA §10, PLAN PR-10: the site may be crawled, the panel and the API
// routes may not (/admin also carries noindex, src/app/admin/layout.tsx).
// Generated at build time; siteUrl() reads the environment at call time.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
