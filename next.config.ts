import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets several dev servers share the repo (one build folder each).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
};

export default nextConfig;
