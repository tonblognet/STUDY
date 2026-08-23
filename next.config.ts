import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  basePath: isGitHubPages ? "/STUDY" : "",
};

export default nextConfig;
