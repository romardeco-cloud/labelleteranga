"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Product, fetchProducts } from "@/lib/api";
import ProductCard from "@/components/ProductCard";

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchProducts(search ? { search } : {})
      .then((data) => setProducts(data.results ?? data))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-brand-light border-2 border-brand-accent/50 rounded-xl p-8 mb-8 text-center">
        <Image
          src="/logo.jpg"
          alt="La Belle Teranga"
          width={88}
          height={88}
          className="rounded-full mx-auto mb-3 ring-2 ring-brand-accent"
        />
        <h1 className="text-3xl font-bold text-brand-dark mb-2">Bienvenue chez La Belle Teranga</h1>
        <p className="text-brand italic mb-1">L&apos;art du service</p>
        <p className="text-gray-600">Vos courses livrees partout au Senegal.</p>
      </div>

      <input
        type="search"
        placeholder="Rechercher un produit..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border border-brand/30 rounded-lg px-4 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-brand-accent"
      />

      {loading ? (
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
    </div>
  );
}
