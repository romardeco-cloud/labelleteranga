"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import DailyMenuShowcase, { useHasDailyMenus } from "@/components/site/DailyMenuShowcase";
import PromoBands from "@/components/site/PromoBands";
import LoyaltyBanner from "@/components/site/LoyaltyBanner";
import { useSite } from "@/components/site/SiteContext";
import { Product, api, fetchProducts } from "@/lib/api";
import { categoryEmoji, storeImage } from "@/lib/branding";
import { SiteCategory, shortName } from "@/lib/site";

export default function StoreHomePage() {
  const { site } = useSite();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const isResto = site.slug === "resto";
  const menus = useHasDailyMenus(site.slug);
  const hasShowcase = Boolean(menus && (menus.lunch || menus.special));
  // categories et nombre de produits : rafraichis a chaque visite (et au retour sur l'onglet), donc a jour des qu'un produit est ajoute, modifie ou supprime
  const [categories, setCategories] = useState<SiteCategory[]>(site.categories ?? []);
  const [total, setTotal] = useState<number>(site.products_count ?? 0);
  useEffect(() => {
    const refresh = () =>
      api
        .get(`/stores/sites/${site.slug}/`)
        .then((res) => {
          setCategories(res.data.categories ?? []);
          setTotal(res.data.products_count ?? 0);
        })
        .catch(() => {});
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [site.slug]);

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
      {hasShowcase && menus ? (
        <DailyMenuShowcase menus={menus} />
      ) : (
        <div
          className="w-full text-center py-5 sm:py-12 px-4 bg-cover bg-center"
          style={{ backgroundImage: "linear-gradient(rgba(110,18,18,0.6), rgba(110,18,18,0.78)), linear-gradient(135deg, #9c1c1c, #6e1212)" }}
        >
          <Image
            src={storeImage(site.name)}
            alt={site.name}
            width={480}
            height={330}
            priority
            className="mx-auto mb-3 sm:mb-4 h-16 sm:h-36 w-auto object-contain rounded-2xl bg-white/95 p-1.5 sm:p-2 shadow-lg ring-2 ring-white/30"
          />
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1 sm:mb-2 drop-shadow">{shortName(site.name)}</h1>
          <p className="text-sm sm:text-base text-white/90 max-w-xl mx-auto">
            {site.description || "Commandez en ligne."}
          </p>
          <p className="hidden sm:block text-brand-accent italic mt-1">L&apos;art du service</p>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8">
        <PromoBands />
        <LoyaltyBanner />
        <div className="sticky top-[76px] z-10 -mx-4 px-4 pt-2 pb-2 bg-[#fdf8ee]/95 backdrop-blur border-b border-brand/10 mb-4">
        <input
          type="search"
          placeholder={isResto ? "🔍 Rechercher un plat..." : "🔍 Rechercher un produit..."}
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="w-full border border-brand/30 bg-white rounded-xl px-4 py-2.5 mb-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-accent"
        />

        {categories.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-brand-dark/70 mb-1.5">
              {isResto ? "Nos menus" : "Nos rayons"} <span className="font-normal normal-case">· touchez une famille pour la voir</span>
            </p>
            {/* telephone : 2 lignes qui defilent ; ordinateur : toutes les familles visibles d'un coup */}
            <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-2 overflow-x-auto pb-1 sm:flex sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ id: null as number | null, name: "Tout", products_count: total }, ...categories].map((c) => {
                const actif = category === c.id;
                return (
                  <button
                    key={c.id ?? "all"}
                    onClick={() => {
                      setPage(1);
                      setCategory(c.id);
                    }}
                    aria-pressed={actif}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left shadow-sm transition active:scale-95 ${
                      actif ? "bg-brand border-brand text-white shadow-md" : "bg-white border-brand/25 text-brand-dark hover:border-brand hover:bg-brand-light"
                    }`}
                  >
                    <span className="text-2xl leading-none" aria-hidden>
                      {c.id === null ? "🛍️" : categoryEmoji(c.name)}
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="text-sm font-bold whitespace-nowrap">{c.name}</span>
                      {c.products_count > 0 && (
                        <span className={`text-[11px] ${actif ? "text-white/80" : "text-gray-500"}`}>
                          {c.products_count} produit{c.products_count > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        </div>

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
