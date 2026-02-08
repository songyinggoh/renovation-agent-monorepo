import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Renovation Agent",
    short_name: "RenovAgent",
    description:
      "AI-powered renovation planning assistant. Plan your dream renovation with intelligent room-by-room guidance, smart budgeting, and contractor matching.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#b85a32",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
