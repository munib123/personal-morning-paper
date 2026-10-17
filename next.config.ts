import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Heavy server-only packages stay external (Chromium, transformers.js).
  serverExternalPackages: [
    "@sparticuz/chromium",
    "puppeteer-core",
    "puppeteer",
    "@huggingface/transformers",
    "onnxruntime-node",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
