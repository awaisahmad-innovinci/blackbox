import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@blackbox/ui", "@blackbox/shared"],
};

export default nextConfig;
