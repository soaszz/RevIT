import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
