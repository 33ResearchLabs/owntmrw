import type { MetadataRoute } from "next";

/**
 * Web app manifest: what Android and desktop Chrome read when the site is
 * added to a home screen. The 192/512 icons live in `public/` rather than as
 * `app/icon*.png` because Next only links the `app/` ones as `<link rel=icon>`;
 * the manifest wants plain URLs. Colours are the page surface, so the splash
 * matches the first paint.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "tekno.works",
    short_name: "tekno.works",
    description:
      "Institutional-grade intelligence for every project launched on MetaDAO and Futard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#0d0d0d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
