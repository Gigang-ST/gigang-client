import type { NextConfig } from "next";
import { execSync } from "child_process";
import bundleAnalyzer from "@next/bundle-analyzer";

function getGitVersion(): string {
  try {
    return execSync("git describe --tags --abbrev=0", { encoding: "utf-8" }).trim();
  } catch {
    return "v0.0.0";
  }
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: getGitVersion(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withBundleAnalyzer(nextConfig);
