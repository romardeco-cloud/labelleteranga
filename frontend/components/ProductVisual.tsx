"use client";

import { useState } from "react";
import { productEmoji } from "@/lib/branding";

/** Photo reduite pour les listes : Cloudinary sert une miniature (largeur limitee) au lieu de la photo d'origine, bien plus legere. */
export function thumb(url: string, width: number) {
  return url.includes("res.cloudinary.com") && url.includes("/image/upload/") ? url.replace("/image/upload/", `/image/upload/w_${width},c_limit/`) : url;
}

/** Photo du produit, ou illustration (emoji) tant qu'aucune photo n'a ete ajoutee. */
export default function ProductVisual({
  image,
  name,
  category,
  size = "card",
  natural = false,
  cover = false,
}: {
  image?: string | null;
  name: string;
  category?: string | null;
  size?: "card" | "tile";
  /** true : la photo est affichee en entier, sans recadrage (page produit). */
  natural?: boolean;
  /** true : la photo remplit toujours le cadre (cartes des bandes de pub). */
  cover?: boolean;
}) {
  const [wide, setWide] = useState(false);
  if (image) {
    if (natural) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={image} alt={name} className="w-full h-auto" />;
    }
    // les images larges (combos, affiches avec texte) sont affichees en entier au lieu d'etre recadrees
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={thumb(image, size === "tile" ? 240 : 560)} alt={name} loading="lazy" decoding="async" onLoad={(e) => setWide(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight >= 1.4)} className={`w-full h-full ${wide && !cover ? "object-contain" : "object-cover"}`} />;
  }
  return (
    <div
      role="img"
      aria-label={name}
      className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-light to-white"
    >
      <span className={size === "card" ? "text-6xl" : "text-3xl"}>{productEmoji(name, category)}</span>
    </div>
  );
}
