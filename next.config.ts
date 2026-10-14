import type { NextConfig } from "next";

const SUPABASE_HOST = "https://ckzhsfxbpepaletjhsnt.supabase.co";
const isProd = process.env.NODE_ENV === "production";

// ARHITECTURA §9: a static CSP (no nonce, the pages are prerendered). Next 16
// inlines its RSC payload scripts, so 'unsafe-inline' stays; 'unsafe-eval' only
// in development; vercel.live is the preview toolbar on Vercel previews.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://challenges.cloudflare.com https://vercel.live`,
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
  // renderer must be required by Node at runtime, outside the bundle.
  serverExternalPackages: ["@react-email/render", "@react-email/components"],
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
