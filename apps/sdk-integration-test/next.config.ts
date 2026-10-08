import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sentriq/core", "@sentriq/browser"],
  poweredByHeader: false,
};

export default nextConfig;
