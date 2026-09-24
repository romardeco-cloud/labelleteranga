"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSite } from "@/components/site/SiteContext";
import { addToCart } from "@/lib/api";
import { SiteDailyMenus, fetchSiteMenus } from "@/lib/site";
import { useToday } from "@/lib/today";
import type { DailyMenu, DailyMenuItem } from "@/lib/store-admin";

/**
 * Vitrine "menu du jour / speciaux du jour" habillee aux couleurs de la marque (meme esprit que
 * ProductShowcase) : panneau de presentation a gauche, carrousel de plats a droite. Remplace le
 * bandeau d'accueil classique tant qu'un menu du jour ou des speciaux sont publies aujourd'hui,
 * pour que ce soit la toute premiere chose visible en arrivant sur le site.
 */

const FEATURES: Record<string, string[]> = {
  "Boissons et jus": ["Fraîcheur garantie", "Préparé minute", "Sans conservateur", "Service rapide"],
  "Burgers et sandwichs": ["Viande fraîche", "Pain moelleux", "Sauce maison", "Fait à la commande"],
  "Desserts et pâtisseries": ["Fait maison", "Recette gourmande", "Ingrédients frais", "Sur commande"],
  "Plats sénégalais": ["Recette traditionnelle", "Ingrédients frais", "Fait maison", "Portion généreuse"],
  "Poulet et grillades": ["Poulet frais", "Braisé au charbon", "Sauce maison", "Portion généreuse"],
  "Snacks et accompagnements": ["Fait maison", "Croustillant", "Ingrédients frais", "Fait à la commande"],
  Pizzas: ["Pâte fraîche", "Ingrédients frais", "Four chaud", "Fait à la commande"],
  PIZZA: ["Pâte fraîche", "Ingrédients frais", "Four chaud", "Fait à la commande"],
};
const DEFAULT_FEATURES = ["Fait maison", "Ingrédients frais", "Recette maison", "Fait à la commande"];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <circle cx="10" cy="10" r="8.5" />
      <path d="M6.5 10.2l2.2 2.2 4.8-4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const xof = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v));

function DishCard({ item, slug }: { item: DailyMenuItem; slug: string }) {
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  const p = item.product;
  const features = FEATURES[p.category?.name ?? ""] ?? DEFAULT_FEATURES;
  const price = item.special_price ?? p.effective_price;

  async function add() {
    setState("busy");
    try {
      await addToCart(p.id, 1);
      setState("added");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="shrink-0 w-[200px] sm:w-[230px] snap-start rounded-2xl overflow-hidden shadow-lg bg-[#6e0d0d] flex flex-col">
      <Link href={`/s/${slug}/product/${p.id}`} className="relative block aspect-square">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#8a1414] to-[#6e0d0d]" />
        )}
        <span className="absolute top-2 right-2 bg-[#e9c46a] text-[#6e0d0d] font-bold text-[9px] px-2 py-1 rounded-full shadow">FAIT MAISON</span>
        {!p.in_stock && (
          <span className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-xs">Rupture</span>
        )}
      </Link>

      <div className="px-3 sm:px-4 pt-3 pb-4 text-center flex-1 flex flex-col">
        <p className="text-[#deb25a] text-[9px] tracking-[0.25em] font-bold uppercase mb-1">La Belle Teranga</p>
        <Link href={`/s/${slug}/product/${p.id}`}>
          <h3 className="font-serif text-lg sm:text-xl font-bold text-[#f5e6c8] leading-tight">{p.name}</h3>
        </Link>
        <div className="w-10 h-0.5 bg-[#deb25a] mx-auto my-2" />

        <div className="grid grid-cols-4 gap-1 mb-3">
          {features.map((f) => (
            <span key={f} className="flex flex-col items-center gap-0.5 text-[#f5e6c8]">
              <CheckIcon />
              <span className="text-[6.5px] sm:text-[7px] leading-[1.1] font-semibold">{f}</span>
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="font-serif font-bold text-[#f5e6c8] text-base sm:text-lg">{xof(price)} FCFA</span>
          <button
            onClick={add}
            disabled={state === "busy" || !p.in_stock}
            className="shrink-0 border border-[#deb25a] text-[#deb25a] text-[11px] font-bold px-2.5 py-1.5 rounded-full disabled:opacity-40 hover:bg-[#deb25a] hover:text-[#6e0d0d] transition"
          >
            {state === "added" ? "Ajouté ✓" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Carousel({
  title,
  note,
  lunchItems,
  specialItems,
  slug,
}: {
  title: string;
  note?: string;
  lunchItems: DailyMenuItem[];
  specialItems: DailyMenuItem[];
  slug: string;
}) {
  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-baseline gap-2 flex-wrap mb-3 px-1">
        <h2 className="text-lg sm:text-xl font-bold text-[#f5e6c8]">{title}</h2>
        {note && <span className="text-xs sm:text-sm text-[#f5e6c8]/70">{note}</span>}
      </div>
      <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {lunchItems.map((i) => (
          <DishCard key={`lunch-${i.product.id}`} item={i} slug={slug} />
        ))}
        {lunchItems.length > 0 && specialItems.length > 0 && (
          <div className="shrink-0 self-stretch w-1 sm:w-1.5 my-2 rounded-full bg-white/90" aria-hidden />
        )}
        {specialItems.map((i) => (
          <DishCard key={`special-${i.product.id}`} item={i} slug={slug} />
        ))}
      </div>
    </div>
  );
}

function OrderByNumber({ menu }: { menu: DailyMenu }) {
  const [number, setNumber] = useState("");
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function orderByNumber(e: React.FormEvent) {
    e.preventDefault();
    const item = menu.items.find((i) => i.number === Number(number));
    if (!item) return setMsg({ ok: false, text: `Le numéro ${number || "?"} n'existe pas dans le menu du jour.` });
    try {
      await addToCart(item.product.id, Math.max(1, qty));
      setMsg({ ok: true, text: `${qty} x ${item.product.name} ajouté au panier.` });
      setNumber("");
      setQty(1);
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.detail ?? "Ajout impossible." });
    }
  }

  return (
    <form onSubmit={orderByNumber} className="mt-1 flex flex-wrap items-end gap-2 bg-white/10 border border-white/15 rounded-xl p-3 backdrop-blur-sm">
      <label className="text-xs sm:text-sm text-[#f5e6c8]">
        <span className="block text-[#f5e6c8]/70 mb-1">Commander avec le numéro de votre choix</span>
        <input
          type="number"
          min={1}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="N°"
          className="w-24 border border-white/20 bg-white/95 text-[#3a0707] rounded px-3 py-2"
        />
      </label>
      <label className="text-xs sm:text-sm text-[#f5e6c8]">
        <span className="block text-[#f5e6c8]/70 mb-1">Quantité</span>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-20 border border-white/20 bg-white/95 text-[#3a0707] rounded px-3 py-2"
        />
      </label>
      <button className="bg-[#deb25a] text-[#3a0707] rounded px-4 py-2 font-bold text-sm">Ajouter au panier</button>
      {msg && <p className={`text-sm w-full ${msg.ok ? "text-green-300" : "text-red-300"}`}>{msg.text}</p>}
    </form>
  );
}

/** true des qu'un menu du jour ou des speciaux sont publies aujourd'hui pour ce site. */
export function useHasDailyMenus(slug: string) {
  const [menus, setMenus] = useState<SiteDailyMenus | null>(null);
  const today = useToday();

  useEffect(() => {
    const load = () => fetchSiteMenus(slug).then(setMenus);
    load();
    const t = setInterval(load, 300000);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, today.key]);

  return menus;
}

export default function DailyMenuShowcase({ menus }: { menus: SiteDailyMenus }) {
  const { site } = useSite();
  const today = useToday();

  return (
    <div className="w-full bg-gradient-to-br from-[#9c1c1c] via-[#7a1414] to-[#3a0707]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col md:flex-row gap-6 md:gap-8">
        <div className="md:w-[300px] shrink-0 flex flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt={site.name}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-lg ring-2 ring-white/40 object-cover mb-4"
          />
          <p className="text-[#deb25a] text-xs tracking-[0.3em] font-bold uppercase mb-2">La Belle Teranga</p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#f5e6c8] leading-tight mb-2">Menu du jour et spéciaux</h1>
          <div className="w-14 h-0.5 bg-[#deb25a] mb-4" />
          <p className="text-[#f5e6c8]/90 text-sm sm:text-base mb-6">
            {site.description || "Thiéboudienne, yassa, mafé, domoda, étodjey... le goût de chez nous, préparé avec soin et servi chaud."}
          </p>
          <span className="inline-block w-fit text-xs font-semibold text-[#f5e6c8] bg-white/10 border border-white/20 rounded-full px-3 py-1 mb-6">
            📅 {today.long}
          </span>

          <div className="mt-auto text-[#f5e6c8]/80 text-xs sm:text-sm space-y-1">
            {site.address && <p>{site.address}</p>}
            {(site.phone || site.email) && <p>{[site.phone, site.email].filter(Boolean).join(" • ")}</p>}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <Carousel
            title={[menus.lunch?.title, menus.special?.title].filter(Boolean).join(" • ")}
            note={[menus.lunch?.note, menus.special?.note].filter(Boolean).join(" — ")}
            lunchItems={menus.lunch?.items ?? []}
            specialItems={menus.special?.items ?? []}
            slug={site.slug}
          />
          {menus.lunch && <OrderByNumber menu={menus.lunch} />}
        </div>
      </div>
    </div>
  );
}
