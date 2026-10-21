import type { NextConfig } from "next";

const SUPABASE_HOST = "https://ckzhsfxbpepaletjhsnt.supabase.co";
const isProd = process.env.NODE_ENV === "production";

// ARHITECTURA §9: a static CSP (no nonce, the pages are prerendered). Next 16
// inlines its RSC payload scripts, so 'unsafe-inline' stays; 'unsafe-eval' only
// in development; vercel.live is the preview toolbar on Vercel previews.
const csp = [
  "default-src 'self'",
  // va.vercel-scripts.com is only the debug build of Vercel Analytics in development;
  // in production both Analytics and Speed Insights load from this origin (/_vercel/*).
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval' https://va.vercel-scripts.com"} https://challenges.cloudflare.com https://vercel.live`,
  "frame-src https://challenges.cloudflare.com https://www.google.com https://vercel.live",
  `img-src 'self' data: blob: ${SUPABASE_HOST}`,
  `connect-src 'self' ${SUPABASE_HOST} https://challenges.cloudflare.com https://vercel.live wss://ws-us3.pusher.com`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Photos come from the public `media` bucket (ARHITECTURA §5, PLAN PR-5); the CSP
  // img-src above already allows the host.
  images: {
    remotePatterns: [new URL(`${SUPABASE_HOST}/storage/v1/object/public/media/**`)],
  },
  partialPrefetching: true,
  // Vercel restores .next/cache between builds and, with the Turbopack build
  // cache on (the 16.3 default), the Tailwind loader served a stale compiled
  // globals.css in production. Cold builds cost seconds; stale CSS cost the site.
  experimental: {
    turbopackFileSystemCacheForBuild: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // react-dom/server is a throwing stub in the React Server layer; the email
  // renderer must be required by Node at runtime, outside the bundle. resvg is a
  // native Node addon (the drawing PNG, PR-10) and cannot be bundled either.
  serverExternalPackages: ["@react-email/render", "@react-email/components", "@resvg/resvg-js"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
