import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RevIT | Review It Thoroughly",
    short_name: "RevIT",
    description: "Medical Technology reviewer, study planner, and progress tracker.",
    id: "/",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#0d2822",
    icons: [
      { src: "/revit-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/revit-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
