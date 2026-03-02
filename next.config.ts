import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const cspDirectives = [
  "default-src 'self'",
  `connect-src 'self' ${supabaseUrl} https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io`,
  `style-src 'self' 'unsafe-inline'`,
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`,
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Content-Security-Policy",
            value: cspDirectives,
          },
        ],
      },
    ];
  },
};

// Sentry runtime error capture works via instrumentation.ts — no build-time
// wrapper needed. Add withSentryConfig() here once SENTRY_ORG, SENTRY_PROJECT,
// and SENTRY_AUTH_TOKEN are configured on Vercel for source map uploads.
export default nextConfig;
