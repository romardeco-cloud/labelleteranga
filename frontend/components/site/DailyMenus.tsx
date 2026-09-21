"use client";

import { useEffect, useState } from "react";
import ProductCard from "@/components/ProductCard";
import ProductVisual from "@/components/ProductVisual";
import { useSite } from "@/components/site/SiteContext";
import { addToCart } from "@/lib/api";
import { SiteDailyMenus, fetchSiteMenus } from "@/lib/site";
import { useToday } from "@/lib/today";
import type { DailyMenuItem } from "@/lib/store-admin";

const xof = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";

function LunchRow({ item }: { item: DailyMenuItem }) {
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  const [error, setError] = useState("");
  const p = item.product;

  async function add() {
    setState("busy");
    setError("");
    try {
      await addToCart(p.id, 1);
      setState("added");
      setTimeout(() => setState("idle"), 1500);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Ajout impossible.");
      setState("idle");
    }
  }

  return (
    <li className="flex items-center gap-3 bg-white border rounded-xl p-2.5">
      <span className="w-9 h-9 rounded-full bg-brand text-white font-bold flex items-center justify-center shrink-0">{item.number}</span>
      <span className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-brand-light">
        <ProductVisual image={p.image} name={p.name} category={p.category?.name} size="tile" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-tight">{p.name}</p>
        {p.description && <p className="text-xs text-gray-500 line-clamp-1">{p.description}</p>}
        <p className="font-bold text-brand-dark text-sm">{xof(p.effective_price)}</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <button onClick={add} disabled={state === "busy" || !p.in_stock} className="bg-brand text-white text-sm px-3 py-1.5 rounded disabled:opacity-40">
        {!p.in_stock ? "Rupture" : state === "added" ? "Ajoute" : "Ajouter"}
      </button>
    </li>
  );
}

/** Speciaux du jour et menu du midi du point de vente (choisis dans l'administration). */
export default function DailyMenus() {
  const { site } = useSite();
  const [menus, setMenus] = useState<SiteDailyMenus | null>(null);
  const [number, setNumber] = useState("");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const today = useToday();

  // le menu du jour se met a jour tout seul : a l'ouverture, toutes les 5 minutes, au retour sur la page et au changement de date
  useEffect(() => {
    const load = () => fetchSiteMenus(site.slug).then(setMenus);
    load();
    const t = setInterval(load, 300000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [site.slug, today.key]);

  if (!menus || (!menus.lunch && !menus.special)) return null;

  async function orderByNumber(e: React.FormEvent) {
    e.preventDefault();
    const item = menus?.lunch?.items.find((i) => i.number === Number(number));
    if (!item) return setMsg({ ok: false, text: `Le numero ${number || "?"} n'existe pas dans le menu du jour.` });
    try {
      await addToCart(item.product.id, Math.max(1, qty));
      setMsg({ ok: true, text: `${qty} x ${item.product.name} ajoute au panier.` });
      setNumber("");
      setQty(1);
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.detail ?? "Ajout impossible." });
    }
  }

  return (
    <div className="space-y-8 mb-10">
      {menus.special && (
        <section>
          <div className="flex items-baseline gap-3 flex-wrap mb-3">
            <h2 className="text-2xl font-bold text-brand-dark">{menus.special.title}</h2>
            <span className="text-sm font-semibold text-brand bg-brand-light border border-brand/20 rounded-full px-3 py-0.5">📅 {today.long}</span>
            {menus.special.note && <span className="text-sm text-gray-500">{menus.special.note}</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {menus.special.items.map((i) => (
              <ProductCard key={i.product.id} product={i.product as never} />
            ))}
          </div>
        </section>
      )}

      {menus.lunch && (
        <section className="rounded-2xl bg-brand-light border border-brand-accent/40 p-4 sm:p-5">
          <div className="flex items-baseline gap-3 flex-wrap mb-3">
            <h2 className="text-2xl font-bold text-brand-dark">{menus.lunch.title}</h2>
            <span className="text-sm font-semibold text-brand bg-white border border-brand/20 rounded-full px-3 py-0.5">📅 {today.long}</span>
            {menus.lunch.note && <span className="text-sm text-gray-600">{menus.lunch.note}</span>}
          </div>
          <ul className="space-y-2">
            {menus.lunch.items.map((i) => (
              <LunchRow key={i.product.id} item={i} />
            ))}
          </ul>
          <form onSubmit={orderByNumber} className="mt-4 flex flex-wrap items-end gap-2 bg-white border rounded-xl p-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Commander avec le numero de votre choix</span>
              <input
                type="number"
                min={1}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="N°"
                className="w-24 border rounded px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Quantite</span>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-20 border rounded px-3 py-2" />
            </label>
            <button className="bg-brand text-white rounded px-4 py-2 font-medium">Ajouter au panier</button>
            {msg && <p className={`text-sm w-full ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
          </form>
        </section>
      )}
    </div>
  );
}
