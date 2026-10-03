import type { Product } from "@/lib/api";
import { money, poids, prixAffiche } from "@/lib/productLabel";

/**
 * Etiquette posee sur la photo du produit (en bas) : poids/format a gauche, prix a droite. Les valeurs viennent
 * de la fiche produit, donc elles suivent automatiquement toute modification faite dans Admin > Produits.
 * A placer dans un parent en position relative.
 */
export default function PriceTag({ product, size = "card" }: { product: Product; size?: "card" | "large" }) {
  const f = poids(product);
  const { actuel, avant } = prixAffiche(product);
  const txt = size === "large" ? "text-base px-3 py-1" : "text-[11px] sm:text-xs px-2 py-0.5";
  return (
    <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-end justify-between gap-1">
      {f ? <span className={`rounded-full bg-white/90 text-gray-700 font-semibold shadow ${txt}`}>{f}</span> : <span />}
      <span className={`rounded-full text-white font-bold shadow flex flex-col items-end leading-tight ${txt} ${avant ? "bg-red-600" : "bg-brand"}`}>
        {avant && <span className="text-[0.75em] line-through opacity-80">{money(avant)}</span>}
        {money(actuel)}
      </span>
    </div>
  );
}
