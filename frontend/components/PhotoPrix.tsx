"use client";

import { useState } from "react";
import ProductVisual, { thumb } from "@/components/ProductVisual";
import type { PriceZone, Product, ZoneArea } from "@/lib/api";
import { money, poids, prixAffiche } from "@/lib/productLabel";

/** Texte a ecrire dans la zone : prix actuel, precede du poids/format si demande. */
export function lignesZone(p: Pick<Product, "unit" | "price" | "effective_price">, zone: PriceZone) {
  const prix = money(prixAffiche(p).actuel);
  const f = poids(p);
  return zone.contenu === "poids_prix" && f ? [f, prix] : [prix];
}

/** Cache de la zone (en pixels de la photo d'origine) avec le prix actuel : SVG qui suit la taille de la photo. */
export function CacheZone({ zone, lignes, largeur, hauteur }: { zone: ZoneArea; lignes: string[]; largeur: number; hauteur: number }) {
  const W = zone.w * largeur;
  const H = zone.h * hauteur;
  const long = Math.max(...lignes.map((l) => l.length));
  const taille = Math.min((H / lignes.length) * 0.72, (W * 0.88) / (long * 0.62));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute"
      style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.w * 100}%`, height: `${zone.h * 100}%` }}
      aria-hidden
    >
      <rect width={W} height={H} rx={Math.min(W, H) * 0.18} fill={zone.bg} />
      {lignes.map((l, i) => (
        <text
          key={i}
          x={W / 2}
          y={(H / lignes.length) * (i + 0.5)}
          dominantBaseline="central"
          textAnchor="middle"
          fill={zone.fg}
          fontFamily="Arial, sans-serif"
          fontWeight={i === lignes.length - 1 ? 800 : 600}
          fontSize={i === lignes.length - 1 ? taille : taille * 0.8}
          textLength={l.length * taille * 0.62 > W * 0.92 ? W * 0.92 : undefined}
          lengthAdjust="spacingAndGlyphs"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

/** Les caches d'un produit : prix (toujours) et poids (si sa pastille est definie et le poids renseigne). */
export function CachesProduit({ product, zone, largeur, hauteur }: { product: Product; zone: PriceZone; largeur: number; hauteur: number }) {
  const f = poids(product);
  return (
    <>
      <CacheZone zone={zone} lignes={lignesZone(product, zone)} largeur={largeur} hauteur={hauteur} />
      {zone.poids && f && <CacheZone zone={zone.poids} lignes={[f]} largeur={largeur} hauteur={hauteur} />}
    </>
  );
}

/**
 * Photo du produit. Si un prix est deja ecrit dans la photo (zone definie dans Admin > Produits), cette zone est
 * recouverte par le prix ACTUEL : la photo suit donc toujours le prix de l'admin. Sans zone : affichage habituel.
 * mode "fill" : remplit le cadre du parent (cartes) ; "natural" : photo entiere a sa taille (fiche produit).
 */
export default function PhotoPrix({
  product,
  mode = "fill",
  size = "card",
  className = "",
  entiere = false,
}: {
  product: Product;
  mode?: "fill" | "natural";
  size?: "card" | "tile";
  className?: string;
  /** true : photo toujours entiere (jamais recadree), meme sans zone de prix (affiche). */
  entiere?: boolean;
}) {
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const zone = product.price_zone ?? null;
  if (!product.image || (!zone && !entiere)) {
    return <ProductVisual image={product.image} name={product.name} category={product.category?.name} size={size} natural={mode === "natural"} />;
  }
  const src = mode === "natural" ? product.image : thumb(product.image, size === "tile" ? 320 : 640);
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={product.name}
      loading={mode === "natural" ? undefined : "lazy"}
      onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      className="block w-full h-full"
    />
  );
  const cache = dim && zone && <CachesProduit product={product} zone={zone} largeur={dim.w} hauteur={dim.h} />;

  if (mode === "natural") {
    return (
      <div className={`relative w-full ${className}`}>
        {img}
        {cache}
      </div>
    );
  }
  // photo entiere centree dans le cadre (jamais recadree, sinon la zone ne tomberait plus sur le prix ecrit)
  const ratio = dim ? dim.w / dim.h : 1;
  return (
    <div className={`w-full h-full flex items-center justify-center bg-white ${className}`}>
      <div className="relative" style={{ aspectRatio: String(ratio), ...(ratio >= 1 ? { width: "100%" } : { height: "100%" }) }}>
        {img}
        {cache}
      </div>
    </div>
  );
}
