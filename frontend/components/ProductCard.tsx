"use client";

import { Product, addToCart } from "@/lib/api";
import { useState } from "react";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

export default function ProductCard({ product }: { product: Product }) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  async function handleAdd() {
    setLoading(true);
    try {
      await addToCart(product.id, 1);
      setAdded(true);
      setTimeout(() => setAdded(false), 1500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg bg-white overflow-hidden flex flex-col">
      <div className="aspect-square bg-brand-light flex items-center justify-center overflow-hidden">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.name} className="object-cover w-full h-full" />
        ) : (
          <span className="text-brand text-sm">{product.name}</span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <span className="text-xs text-gray-400">{product.category?.name}</span>
        <h3 className="font-medium leading-tight">{product.name}</h3>
        {product.active_promotion_name && (
          <span className="text-xs bg-brand-accent text-brand-dark font-medium px-1.5 py-0.5 rounded w-fit">
            {product.active_promotion_name}
          </span>
        )}
        <div className="mt-auto flex items-center justify-between pt-2">
          {product.active_promotion_name ? (
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
            {!product.in_stock ? "Rupture" : added ? "Ajoute" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
