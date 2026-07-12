import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile the TS-source workspace package (no build step of its own).
  transpilePackages: ["@mealio/shared"],
};

export default nextConfig;
