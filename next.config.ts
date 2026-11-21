import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPages ? process.env.NEXT_PUBLIC_BASE_PATH || "" : "";

const nextConfig: NextConfig = {
  ...(isGithubPages
    ? {
        output: "export",
        basePath,
        assetPrefix: basePath || undefined,
      }
    : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
