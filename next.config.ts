import type { NextConfig } from "next";

// Static export: the frontend deploys as pure static files on Vercel while
// /api/* is served by the Go function (see vercel.json rewrites).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: { root: __dirname },
};

// Static export ignores rewrites — in production Vercel maps these pretty URLs
// to their static pages (vercel.json); next dev needs the same mapping.
if (process.env.NODE_ENV === "development") {
  nextConfig.rewrites = async () => [
    { source: "/decks/:slug", destination: "/deck" },
    { source: "/shared/:slug", destination: "/shared-deck" },
    { source: "/cards/:id", destination: "/card" },
    { source: "/decks/:slug/cards/new", destination: "/card" },
  ];
}

export default nextConfig;
