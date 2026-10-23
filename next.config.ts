import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stripe and postgres are server-only Node packages.
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
};

export default nextConfig;
