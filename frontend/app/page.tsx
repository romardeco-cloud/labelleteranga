"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { PointOfSale, Product, fetchPointsOfSale, fetchProducts } from "@/lib/api";
import { storeImage } from "@/lib/branding";
import ProductCard from "@/components/ProductCard";

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [stores, setStores] = useState<PointOfSale[]>([]);

  useEffect(() => {
    fetchPointsOfSale()
      .then((list) => setStores(list.filter((s) => s.is_active)))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchProducts({ page: String(page), ...(search ? { search } : {}) })
      .then((data) => {
        const rows: Product[] = data.results ?? data;
        setProducts((prev) => (page === 1 ? rows : [...prev, ...rows]));
        setHasMore(Boolean(data.next));
      })
      .finally(() => setLoading(false));
  }, [search, page]);

  return (
    <div>
      <div
        className="w-full text-center py-16 px-4 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(110,18,18,0.55), rgba(110,18,18,0.7)), url('/hero.jpg'), linear-gradient(135deg, #9c1c1c, #6e1212)",
        }}
      >
        <Image
          src="/logo.jpg"
          alt="La Belle Teranga"
          width={96}
          height={96}
          className="rounded-full mx-auto mb-4 ring-4 ring-brand-accent"
        />
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow">Bienvenue chez La Belle Teranga</h1>
        <p className="text-brand-accent italic mb-1 text-lg">L&apos;art du service</p>
        <p className="text-white/90">Vos courses livrees partout au Senegal.</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <input
          type="search"
          placeholder="Rechercher un produit..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-full border border-brand/30 rounded-lg px-4 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-brand-accent"
        />

        {loading && page === 1 ? (
          <p className="text-gray-500">Chargement...</p>
        ) : products.length === 0 ? (
          <p className="text-gray-500">Aucun produit trouve.</p>
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
              {loading ? "Chargement..." : "Voir plus de produits"}
            </button>
          </div>
        )}
        {stores.length > 0 && (
          <section className="mt-14">
            <h2 className="text-2xl font-bold text-brand-dark mb-1">Nos points de vente</h2>
            <p className="text-gray-500 mb-5">Un seul nom, plusieurs metiers : retrouvez-nous partout ou nous servons.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stores.map((store) => (
                <article key={store.id} className="border rounded-xl bg-white overflow-hidden flex flex-col">
                  <div className="relative bg-white h-44 flex items-center justify-center p-3 border-b">
                    <Image
                      src={storeImage(store.name)}
                      alt={store.name}
                      width={400}
                      height={260}
                      className="max-h-full w-auto object-contain"
                    />
                    <span className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white border border-brand/20 rounded-full pl-1 pr-3 py-1 shadow text-xs font-medium text-brand-dark">
                      <Image src="/livraison/livreur.jpg" alt="" width={28} height={28} className="rounded-full object-cover w-7 h-7" />
                      Livraison
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-brand-dark">{store.name}</h3>
                    {store.address && <p className="text-sm text-gray-600 mt-1">{store.address}</p>}
                    {store.phone && (
                      <a href={`tel:${store.phone.replace(/\s+/g, "")}`} className="text-sm text-brand mt-1 inline-block">
                        {store.phone}
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
