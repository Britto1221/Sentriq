import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sentriq/access", "@sentriq/shared", "@sentriq/sdk"],
  poweredByHeader: false,
};

export default nextConfig;
