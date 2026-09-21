"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProductVisual from "@/components/ProductVisual";
import { useSite } from "@/components/site/SiteContext";
import { Product, api, addToCart } from "@/lib/api";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

export default function ProductDetailPage() {
  const params = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");
  const { site, base } = useSite();

  useEffect(() => {
    api.get(`/catalog/products/${params.id}/`, { params: { store: site.slug } }).then((res) => setProduct(res.data));
  }, [params.id, site.slug]);

  if (!product) return <p className="p-8">Chargement...</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 grid sm:grid-cols-2 gap-8">
      <div className={`bg-brand-light rounded-lg flex items-center justify-center overflow-hidden ${product.image ? "" : "aspect-square"}`}>
        <ProductVisual image={product.image} name={product.name} category={product.category?.name} natural />
      </div>
      <div>
        <span className="text-xs text-gray-400">{product.category?.name}</span>
        <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
        <p className="text-gray-600 mb-4">{product.description}</p>
        {product.combo_items && product.combo_items.length > 0 && (
          <div className="mb-4 rounded-xl border border-brand/20 bg-brand-light/60 p-4">
            <p className="font-semibold text-brand-dark mb-1.5">Ce combo contient :</p>
            <ul className="space-y-1 text-gray-700">
              {product.combo_items.map((it, i) => (
                <li key={i}>✓ {it}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-2xl font-bold text-brand-dark mb-4">{formatXof(product.price)}</p>
        <button
          onClick={async () => {
            setError("");
            try {
              await addToCart(product.id, 1);
              setAdded(true);
              setTimeout(() => setAdded(false), 1500);
            } catch (e: any) {
              setError(e?.response?.data?.detail ?? "Ajout impossible.");
            }
          }}
          disabled={!product.in_stock}
          className="bg-brand text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-dark transition disabled:opacity-40"
        >
          {!product.in_stock ? "Rupture de stock" : added ? "Ajoute au panier" : "Ajouter au panier"}
        </button>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        <Link href={base || "/"} className="block text-sm text-brand underline mt-4">
          &larr; Retour
        </Link>
      </div>
    </div>
  );
}
