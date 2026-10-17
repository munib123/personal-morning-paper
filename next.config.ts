import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEMO_FALLBACK reads the persona snapshot with fs at runtime; make sure Vercel ships the file.
  outputFileTracingIncludes: { '/**': ['./public/demo/snapshot.json'] },
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
