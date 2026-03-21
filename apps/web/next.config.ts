import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isProd ? "/archmap" : "",
  assetPrefix: isProd ? "/archmap/" : "",
};

export default nextConfig;
