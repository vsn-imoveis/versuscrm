import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [] },
  async rewrites() {
    return [
      { source: "/api/identify-condo.js", destination: "/api/identify-condo" },
      { source: "/api/identify-condo-fixed.js", destination: "/api/identify-condo" },
      { source: "/api/identify-condo-structural.js", destination: "/api/identify-condo" },
    ];
  }
};

export default nextConfig;
