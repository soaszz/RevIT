import type { NextConfig } from "next";
import { existsSync, readdirSync } from "node:fs";

// Fail the build if commercial inputs accidentally return to public source/assets.
for (const path of ["app/content/bocContent.json", "app/content/elsevierContent.json",
  "app/content/bocSourceManifest.json", "app/content/elsevierSourceManifest.json",
  "docs/reviewer-compatibility/boc-presentation-source-fixture.json"]) {
  if (existsSync(path)) throw new Error("Private reviewer input at public source path");
}
for (const path of ["public/reviewer-assets/boc-7e", "public/reviewer-assets/elsevier-1e"]) {
  if (existsSync(path) && readdirSync(path).length) throw new Error("Private reviewer asset in public directory");
}

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/*": ["./.private-reviewers/verification/**/*"],
  },
  outputFileTracingIncludes: {
    "/api/reviewer/boc": ["./.private-reviewers/runtime/books/boc.json"],
    "/api/reviewer/elsevier": ["./.private-reviewers/runtime/books/elsevier.json"],
    "/api/reviewer/attempt": ["./.private-reviewers/runtime/books/*.json"],
    "/api/reviewer/assets/*": ["./.private-reviewers/runtime/assets/**/*.png"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
          },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/auth/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/overview",
        destination: "/",
      },
      {
        source: "/library",
        destination: "/",
      },
      {
        source: "/progress",
        destination: "/",
      },
      {
        source: "/leaderboards",
        destination: "/",
      },
      {
        source: "/weakness",
        destination: "/",
      },
      {
        source: "/planner",
        destination: "/",
      },
      {
        source: "/grades",
        destination: "/",
      },
      {
        source: "/assistant",
        destination: "/",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/pro",
        destination: "/pricing",
        permanent: false,
      },
      {
        source: "/subscription",
        destination: "/pricing",
        permanent: false,
      },
      {
        source: "/subscriptions",
        destination: "/pricing",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
