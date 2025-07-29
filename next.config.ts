import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      // NEW PATTERN: This is the fix for the new Places API v1
      {
        protocol: "https",
        hostname: "places.googleapis.com",
        port: "",
        pathname: "/v1/places/**", // Wildcard to match all photo paths
      },
      // --- Existing Patterns ---
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
        port: "",
        pathname: "/maps/api/place/photo",
      },
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
        port: "",
        pathname: "/maps/api/place/js/PhotoService.GetPhoto/**",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        port: "",
        pathname: "/vi/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;