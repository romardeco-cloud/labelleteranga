"use client";

import { Product } from "@/lib/api";
import { Site } from "@/lib/site";

/**
 * Fiche produit habillee (cachet, bandeau, prix, arguments, pied de page) directement en HTML par-dessus la
 * photo : contrairement a une image ou le prix serait incruste dans les pixels, tout ici vient des donnees en
 * direct (nom, prix, coordonnees du point de vente) et reste donc toujours a jour sans rien regenerer.
 */

const FEATURES: Record<string, string[]> = {
  "Boissons et jus": ["Fraîcheur garantie", "Préparé minute", "Sans conservateur", "Service rapide"],
  "Burgers et sandwichs": ["Viande fraîche", "Pain moelleux", "Sauce maison", "Fait à la commande"],
  "Desserts et pâtisseries": ["Fait maison", "Recette gourmande", "Ingrédients frais", "Sur commande"],
  "Plats sénégalais": ["Recette traditionnelle", "Ingrédients frais", "Fait maison", "Portion généreuse"],
  "Poulet et grillades": ["Poulet frais", "Braisé au charbon", "Sauce maison", "Portion généreuse"],
  "Snacks et accompagnements": ["Fait maison", "Croustillant", "Ingrédients frais", "Fait à la commande"],
  Pizzas: ["Pâte fraîche", "Ingrédients frais", "Four chaud", "Fait à la commande"],
  PIZZA: ["Pâte fraîche", "Ingrédients frais", "Four chaud", "Fait à la commande"],
};
const DEFAULT_FEATURES = ["Fait maison", "Ingrédients frais", "Recette maison", "Fait à la commande"];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="10" cy="10" r="8.5" />
      <path d="M6.5 10.2l2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

// Combos : la photo est un collage (plats + « Pour X personnes » + titre) sans prix ni pied de page - on peut
// ajouter le prix (toujours a jour) et le contenu par-dessus sans rien dupliquer.
const COLLAGE_ONLY = new Set(["Combos"]);

export default function ProductShowcase({ product, site }: { product: Product; site: Site }) {
  const features = FEATURES[product.category?.name ?? ""] ?? DEFAULT_FEATURES;
  const contact = [site.address, site.phone, site.email].filter(Boolean).join("   •   ");

  // Plats classiques (hors combos) : la photo du produit est deja une fiche complete (cachet, prix, titre,
  // arguments, pied de page tous incrustes dans l'image). On l'affiche telle quelle, sans rien ajouter par-dessus,
  // pour eviter de dupliquer le prix/titre. Si le prix change, l'image doit etre regeneree.
  if (!COLLAGE_ONLY.has(product.category?.name ?? "") && product.image) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-lg bg-[#6e0d0d]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image} alt={product.name} className="block w-full h-auto" />
      </div>
    );
  }

  if (COLLAGE_ONLY.has(product.category?.name ?? "")) {
    return (
      <div className="rounded-2xl overflow-hidden shadow-lg bg-[#6e0d0d]">
        <div className="relative">
          {product.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt={product.name} className="block w-full h-auto" />
          )}
          <div className="absolute -bottom-9 right-5 sm:right-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#deb25a] ring-4 ring-[#f5e6c8] shadow-xl flex flex-col items-center justify-center">
            <span className="font-serif font-bold text-[#6e0d0d] text-base sm:text-lg leading-none">{formatXof(product.price).replace(" FCFA", "")}</span>
            <span className="text-[#6e0d0d] text-[9px] sm:text-[10px] font-bold mt-1">FCFA</span>
          </div>
        </div>

        <div className="px-5 sm:px-8 pt-11 sm:pt-12 pb-6 text-center">
          <p className="text-[#deb25a] text-[11px] sm:text-xs tracking-[0.3em] font-bold uppercase mb-2">La Belle Teranga</p>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#f5e6c8]">{product.name}</h1>
          <div className="w-14 h-0.5 bg-[#deb25a] mx-auto my-3" />
          {product.combo_items && product.combo_items.length > 0 ? (
            <ul className="text-[#f5e6c8]/90 text-sm sm:text-base space-y-1 text-left inline-block">
              {product.combo_items.map((it, i) => (
                <li key={i}>✓ {it}</li>
              ))}
            </ul>
          ) : (
            product.description && <p className="text-[#f5e6c8]/90 text-sm sm:text-base">{product.description}</p>
          )}
        </div>

        {contact && <div className="bg-[#3a0707] text-[#f5e6c8] text-center text-[11px] sm:text-sm py-3 px-4">{contact}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-lg bg-[#6e0d0d]">
      <div className="relative aspect-[1080/560]">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#8a1414] to-[#6e0d0d]" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-[#6e0d0d]" />

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.jpg"
          alt="La Belle Teranga"
          className="absolute top-4 left-4 w-14 h-14 sm:w-20 sm:h-20 rounded-full shadow-lg ring-2 ring-white/40 object-cover"
        />
        <span className="absolute top-4 right-4 bg-[#e9c46a] text-[#6e0d0d] font-bold text-[11px] sm:text-sm px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full shadow">
          FAIT MAISON
        </span>

        <div className="absolute -bottom-9 right-5 sm:right-10 w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-[#deb25a] ring-4 ring-[#f5e6c8] shadow-xl flex flex-col items-center justify-center">
          <span className="font-serif font-bold text-[#6e0d0d] text-base sm:text-xl leading-none">{formatXof(product.price).replace(" FCFA", "")}</span>
          <span className="text-[#6e0d0d] text-[9px] sm:text-[10px] font-bold mt-1">FCFA</span>
        </div>
      </div>

      <div className="px-5 sm:px-8 pt-11 sm:pt-12 pb-6 text-center">
        <p className="text-[#deb25a] text-[11px] sm:text-xs tracking-[0.3em] font-bold uppercase mb-2">La Belle Teranga</p>
        <h1 className="font-serif text-2xl sm:text-4xl font-bold text-[#f5e6c8]">{product.name}</h1>
        <div className="w-14 h-0.5 bg-[#deb25a] mx-auto my-3" />
        {product.description && <p className="text-[#f5e6c8]/90 text-sm sm:text-base mb-2">{product.description}</p>}

        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-4">
          {features.map((f) => (
            <span
              key={f}
              className="border border-[#deb25a] rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-xs text-[#f5e6c8] font-semibold flex items-center gap-1.5"
            >
              <CheckIcon /> {f}
            </span>
          ))}
        </div>
      </div>

      {contact && <div className="bg-[#3a0707] text-[#f5e6c8] text-center text-[11px] sm:text-sm py-3 px-4">{contact}</div>}
    </div>
  );
}
