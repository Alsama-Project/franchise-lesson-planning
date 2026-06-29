import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // The per-locale message catalogs are read from disk at request time
  // (src/i18n/messages.ts enumerates messages/<locale>/*.json). Trace the JSON
  // into the deployed bundle so the filesystem read also works in production.
  outputFileTracingIncludes: {
    "/**": ["./messages/**/*.json"],
    // The PDF routes read the raster logo from disk at render time (react-pdf
    // can't render our SVG), so trace it into the serverless function bundle.
    "/api/pdf/**": ["./public/brand/alsama-logo.png"],
  },
};

// Cookie-based locale only — no i18n routing. Point the plugin at the request
// config explicitly (this app lives under src/).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
