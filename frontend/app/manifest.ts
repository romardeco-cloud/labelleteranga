import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Belle Teranga",
    short_name: "La Belle Teranga",
    description: "Restaurant & fast-food, supermarché, quincaillerie, dépôt d'aliments, ferme et service de forage : tous les services La Belle Teranga au Sénégal.",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf8ee",
    theme_color: "#9c1c1c",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
