import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Speedrecht",
    short_name: "Speedrecht",
    description:
      "Misst deine echte Internet-Geschwindigkeit mit der offiziellen Messmethodik und vergleicht sie mit deinem Vertrag.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#0b57d0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
