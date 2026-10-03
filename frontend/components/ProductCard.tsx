"use client";

import Link from "next/link";
import { useState } from "react";
import ChoixFormat, { aChoisir, prixAffiche } from "@/components/ChoixFormat";
import PriceTag from "@/components/PriceTag";
import PhotoPrix from "@/components/PhotoPrix";
import { useSite } from "@/components/site/SiteContext";
import { Product, addToCart } from "@/lib/api";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

export default function ProductCard({ product }: { product: Product }) {
  const { base, site } = useSite();
  // Resto : les photos sont deja des affiches avec le prix dessine dedans, on n'ajoute rien par-dessus
  // ni sur une photo dont le prix ecrit est deja recouvert par le prix actuel (zone definie)
  const etiquette = site.slug !== "resto" && product.image && !product.price_zone;
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");
  const [choisir, setChoisir] = useState(false);
  const options = site.slug !== "resto" && aChoisir(product);

  async function handleAdd() {
    if (options) {
      setChoisir(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await addToCart(product.id, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Ajout impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg bg-white overflow-hidden flex flex-col">
      <Link href={`${base}/product/${product.id}`} className="relative block aspect-square bg-brand-light overflow-hidden">
        <PhotoPrix product={product} />
        {etiquette && <PriceTag product={product} />}
      </Link>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <span className="text-xs text-gray-400">{product.category?.name}</span>
        <Link href={`${base}/product/${product.id}`} className="font-serif font-semibold text-base leading-tight hover:text-brand">
          {product.name}
        </Link>
        {product.combo_items && product.combo_items.length > 0 && (
          <ul className="text-xs text-gray-500 leading-snug space-y-0.5">
            {product.combo_items.map((it, i) => (
              <li key={i}>• {it}</li>
            ))}
          </ul>
        )}
        {product.active_promotion_name && (
          <span className="text-xs bg-brand-accent text-brand-dark font-medium px-1.5 py-0.5 rounded w-fit">
            {product.active_promotion_name}
          </span>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          {options ? (
            <span className="font-bold text-brand-dark text-sm">{prixAffiche(product)}</span>
          ) : product.active_promotion_name ? (
            <span className="flex flex-col">
              <span className="text-xs line-through text-gray-400">{formatXof(product.price)}</span>
              <span className="font-bold text-red-600">{formatXof(product.effective_price)}</span>
            </span>
          ) : (
            <span className="font-bold text-brand-dark">{formatXof(product.price)}</span>
          )}
          <button
            onClick={handleAdd}
            disabled={loading || !product.in_stock}
            className="bg-brand text-white text-sm px-3 py-1.5 rounded disabled:opacity-40 hover:bg-brand-dark transition"
          >
            {!product.in_stock ? "Rupture" : added ? "Ajoute" : options ? "Choisir" : "Ajouter"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      {choisir && (
        <ChoixFormat
          nom={product.name}
          formats={product.variants}
          prixKg={product.sold_by_weight ? product.effective_price : null}
          onChoix={async (c) => {
            await addToCart(product.id, c.quantity, { variant: c.variant, weight_kg: c.weight_kg });
            setAdded(true);
            setTimeout(() => setAdded(false), 1500);
          }}
          onClose={() => setChoisir(false)}
        />
      )}
    </div>
  );
}
