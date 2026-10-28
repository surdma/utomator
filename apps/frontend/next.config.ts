import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.vercel.app",
      },
      {
        protocol: "https",
        hostname: "app.usmlefocus.com",
      },
      {
        protocol: "https",
        hostname: "skillicons.dev",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
