"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PriceTag from "@/components/PriceTag";
import ProductVisual from "@/components/ProductVisual";
import { telechargerImageAvecPrix } from "@/lib/productLabel";
import ProductShowcase from "@/components/ProductShowcase";
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

  const addButton = (
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
  );

  if (site.slug === "resto") {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <ProductShowcase product={product} site={site} />
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          {addButton}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Link href={base || "/"} className="text-sm text-brand underline">
            &larr; Retour
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 grid sm:grid-cols-2 gap-8">
      <div>
        <div className={`relative bg-brand-light rounded-lg flex items-center justify-center overflow-hidden ${product.image ? "" : "aspect-square"}`}>
          <ProductVisual image={product.image} name={product.name} category={product.category?.name} natural />
          {product.image && <PriceTag product={product} size="large" />}
        </div>
        <button
          onClick={() => telechargerImageAvecPrix(product, site.name.replace(/ La Belle Teranga$/i, "")).catch(() => setError("Image impossible a creer."))}
          className="mt-2 w-full border border-brand text-brand rounded-lg py-2 text-sm font-medium hover:bg-brand-light"
          title="Image carree avec la photo, le nom, le poids et le prix actuels (WhatsApp, Facebook, impression)"
        >
          Télécharger l&apos;image avec prix
        </button>
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
        {addButton}
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
        <Link href={base || "/"} className="block text-sm text-brand underline mt-4">
          &larr; Retour
        </Link>
      </div>
    </div>
  );
}
