import type { NextConfig } from "next";

// Static export: the frontend deploys as pure static files on Vercel while
// /api/* is served by the Go function (see vercel.json rewrites).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: { root: __dirname },
};

// Static export ignores rewrites — in production Vercel maps /decks/{slug}
// to the static /deck page (vercel.json); next dev needs the same mapping.
if (process.env.NODE_ENV === "development") {
  nextConfig.rewrites = async () => [
    { source: "/decks/:slug", destination: "/deck" },
  ];
}

export default nextConfig;
