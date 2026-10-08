import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sentriq/access", "@sentriq/browser", "@sentriq/shared", "@sentriq/sdk"],
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
