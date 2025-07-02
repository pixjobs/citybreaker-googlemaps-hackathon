import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["cesium"],
  webpack(config) {
    // Cesium expects these environment variables to resolve correctly
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      cesium: "cesium/Cesium",
    };

    return config;
  },
  // you can add more options here if needed
  // e.g. reactStrictMode: true,
};

export default nextConfig;
