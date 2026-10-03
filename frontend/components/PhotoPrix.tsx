"use client";

import { useState } from "react";
import ProductVisual, { thumb } from "@/components/ProductVisual";
import type { PriceZone, Product, ZoneArea } from "@/lib/api";
import { miseEnPage, poids } from "@/lib/productLabel";

/** Cache d'un cadre (en pixels de la photo d'origine) avec le texte a jour : SVG qui suit la taille de la photo. */
export function CacheZone({
  product,
  zone,
  area,
  cadre,
  largeur,
  hauteur,
}: {
  product: Pick<Product, "unit" | "price" | "effective_price">;
  zone: PriceZone;
  area: ZoneArea;
  cadre: "prix" | "poids";
  largeur: number;
  hauteur: number;
}) {
  const W = area.w * largeur;
  const H = area.h * hauteur;
  const ovale = zone.forme === "ovale" && cadre === "prix";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      overflow="visible"
      className="pointer-events-none absolute"
      style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%`, overflow: "visible" }}
      aria-hidden
    >
      {ovale ? (
        <ellipse cx={W / 2} cy={H / 2} rx={W / 2 + W * 0.06} ry={H / 2 + H * 0.12} fill={area.bg} />
      ) : (
        <rect width={W} height={H} rx={Math.min(W, H) * 0.18} fill={area.bg} />
      )}
      {miseEnPage(product, zone, W, H, cadre).map((l, i) => (
        <text key={i} x={W / 2} y={l.y} dominantBaseline="central" textAnchor="middle" fill={area.fg} fontFamily="Arial, sans-serif" fontWeight={l.gras ? 800 : 600} fontSize={l.taille}>
          {l.t}
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
      <CacheZone product={product} zone={zone} area={zone} cadre="prix" largeur={largeur} hauteur={hauteur} />
      {zone.poids && f && <CacheZone product={product} zone={zone} area={zone.poids} cadre="poids" largeur={largeur} hauteur={hauteur} />}
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
