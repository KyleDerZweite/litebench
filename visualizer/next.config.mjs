/** @type {import('next').NextConfig} */
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig = {
  output: "export",
  agentRules: false,
  experimental: { cpus: 2 },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: { unoptimized: true },
};

export default nextConfig;
