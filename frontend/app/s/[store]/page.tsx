"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import DailyMenus from "@/components/site/DailyMenus";
import LoyaltyBanner from "@/components/site/LoyaltyBanner";
import { useSite } from "@/components/site/SiteContext";
import { Product, fetchProducts } from "@/lib/api";
import { storeImage } from "@/lib/branding";
import { shortName } from "@/lib/site";

export default function StoreHomePage() {
  const { site } = useSite();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const isResto = site.slug === "resto";

  useEffect(() => {
    setLoading(true);
    fetchProducts({
      store: site.slug,
      page: String(page),
      ...(search ? { search } : {}),
      ...(category ? { category: String(category) } : {}),
    })
      .then((data) => {
        const rows: Product[] = data.results ?? data;
        setProducts((prev) => (page === 1 ? rows : [...prev, ...rows]));
        setHasMore(Boolean(data.next));
      })
      .finally(() => setLoading(false));
  }, [site.slug, search, category, page]);

  return (
    <div>
      <div
        className="w-full text-center py-12 px-4 bg-cover bg-center"
        style={{ backgroundImage: "linear-gradient(rgba(110,18,18,0.6), rgba(110,18,18,0.78)), linear-gradient(135deg, #9c1c1c, #6e1212)" }}
      >
        <Image
          src={storeImage(site.name)}
          alt={site.name}
          width={220}
          height={150}
          className="mx-auto mb-4 h-24 w-auto object-contain rounded-xl bg-white/95 p-1.5 shadow"
        />
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 drop-shadow">{shortName(site.name)}</h1>
        <p className="text-white/90 max-w-xl mx-auto">
          {site.description || "Commandez en ligne."}
        </p>
        <p className="text-brand-accent italic mt-1">L&apos;art du service</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <DailyMenus />
        <LoyaltyBanner />
        <input
          type="search"
          placeholder={isResto ? "Rechercher un plat..." : "Rechercher un produit..."}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-full border border-brand/30 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-brand-accent"
        />

        {site.categories && site.categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {[{ id: null as number | null, name: "Tout" }, ...site.categories].map((c) => (
              <button
                key={c.id ?? "all"}
                onClick={() => {
                  setPage(1);
                  setCategory(c.id);
                }}
                className={`px-4 py-1.5 rounded-full text-sm border transition ${
                  category === c.id ? "bg-brand text-white border-brand" : "border-brand/30 text-brand-dark hover:bg-brand-light"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loading && page === 1 ? (
          <p className="text-gray-500">Chargement...</p>
        ) : products.length === 0 ? (
          <p className="text-gray-500">Aucun produit disponible pour le moment.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
        {hasMore && (
          <div className="text-center mt-6">
            <button
              onClick={() => setPage((n) => n + 1)}
              disabled={loading}
              className="border border-brand text-brand px-5 py-2 rounded-lg hover:bg-brand-light disabled:opacity-50"
            >
              {loading ? "Chargement..." : "Voir plus"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
