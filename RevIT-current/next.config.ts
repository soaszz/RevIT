import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
        source: "/assistant",
        destination: "/",
      },
    ];
  },
};

export default nextConfig;