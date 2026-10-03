"use client";

import { useEffect, useState } from "react";
import PhotoPrix from "@/components/PhotoPrix";
import { useSite } from "@/components/site/SiteContext";
import { Product, fetchProducts } from "@/lib/api";
import { shortName } from "@/lib/site";
import { SENEGAL_TZ } from "@/lib/today";

const money = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";

// couleur du bandeau de chaque categorie (les autres alternent dans PALETTE)
const COULEURS: Record<string, string> = {
  "produits secs": "#1d5fae", "fruits & legumes": "#1f8f3a", "produits liquides": "#d6283a", "charcuterie": "#ea6a12",
  "hygiene et beaute": "#d63384", "boulangerie / patisserie": "#e0a10b", "boissons": "#0f8d9b",
  "entretien de la maison": "#5b3fb0", "surgeles": "#1d6fd0", "fromages": "#1d4f9e", "papeterie": "#c2273b",
};
const PALETTE = ["#1d5fae", "#1f8f3a", "#d6283a", "#ea6a12", "#5b3fb0", "#0f8d9b"];
const cle = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Format affiche sous le nom : le champ "Poids / format" du produit (vide ou "unite" = rien). */
const format = (p: Product) => (p.unit && !["unite", "unité", "piece", "pièce"].includes(p.unit.trim().toLowerCase()) ? p.unit : "");

/**
 * Affiche des prix generee a partir des produits du site : nom, poids/format, photo et prix viennent directement
 * de la base. Modifier un prix ou un poids dans Admin > Produits met donc l'affiche a jour (rechargement
 * automatique toutes les minutes, utile sur un ecran en magasin). Imprimable en A4/A3 paysage.
 */
export default function AffichePage() {
  const { site } = useSite();
  const [produits, setProduits] = useState<Product[] | null>(null);
  const [maj, setMaj] = useState<Date | null>(null);

  useEffect(() => {
    let actif = true;
    async function charger() {
      const tous: Product[] = [];
      for (let page = 1; ; page++) {
        const data = await fetchProducts({ store: site.slug, page: String(page), page_size: "500" });
        tous.push(...(data.results ?? data));
        if (!data.next) break;
      }
      if (actif) {
        setProduits(tous);
        setMaj(new Date());
      }
    }
    charger().catch(() => actif && setProduits((p) => p ?? []));
    const t = setInterval(() => charger().catch(() => undefined), 60_000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, [site.slug]);

  if (!produits) return <p className="p-8 text-center text-gray-500">Chargement de l&apos;affiche...</p>;

  // groupes dans l'ordre des categories du site, puis "Autres"
  const ordre = new Map((site.categories ?? []).map((c, i) => [c.id, i]));
  const groupes = new Map<string, { nom: string; rang: number; items: Product[] }>();
  for (const p of produits.filter((x) => Number(x.effective_price) > 0)) {
    const nom = p.category?.name ?? "Autres";
    const g = groupes.get(nom) ?? { nom, rang: p.category ? ordre.get(p.category.id) ?? 500 : 999, items: [] };
    g.items.push(p);
    groupes.set(nom, g);
  }
  const liste = [...groupes.values()].sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom));
  for (const g of liste) g.items.sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div className="max-w-[1400px] mx-auto px-3 py-4">
      <style>{`@media print {
        @page { size: A3 landscape; margin: 8mm; }
        body * { visibility: hidden; }
        #affiche, #affiche * { visibility: visible; }
        #affiche { position: absolute; left: 0; top: 0; width: 100%; }
        #affiche section { break-inside: avoid; }
        #affiche { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }`}</style>

      <div className="print:hidden flex flex-wrap items-center justify-between gap-2 mb-3 text-sm text-gray-500">
        <span>
          Affiche générée à partir des prix du site{maj ? ` · mise à jour à ${maj.toLocaleTimeString("fr-SN", { ...SENEGAL_TZ, hour: "2-digit", minute: "2-digit" })}` : ""} (automatique chaque minute)
        </span>
        <button onClick={() => window.print()} className="bg-brand text-white px-4 py-2 rounded-lg font-medium">
          Imprimer l&apos;affiche
        </button>
      </div>

      <div id="affiche" className="bg-white">
        <header className="rounded-t-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ background: "#0b4ea2" }}>
          <h1 className="text-white font-black text-2xl sm:text-4xl tracking-wide uppercase">{shortName(site.name)}</h1>
          <p className="text-white/90 italic text-base sm:text-xl">Qualité • Fraîcheur • Proximité</p>
        </header>

        {liste.length === 0 && <p className="p-8 text-center text-gray-500">Aucun produit avec un prix pour le moment.</p>}

        <div className="grid gap-3 p-3 lg:grid-cols-2">
          {liste.map((g, i) => {
            const couleur = COULEURS[cle(g.nom)] ?? PALETTE[i % PALETTE.length];
            return (
              <section key={g.nom} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: couleur }}>
                <h2 className="px-4 py-1.5 text-white font-extrabold uppercase tracking-wide text-lg" style={{ background: couleur }}>
                  {g.nom}
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-1.5 p-2">
                  {g.items.map((p) => {
                    const promo = Number(p.effective_price) < Number(p.price);
                    return (
                      <div key={p.id} className="rounded-xl border border-gray-100 bg-white p-1.5 flex flex-col items-center text-center">
                        <div className="w-full aspect-square overflow-hidden rounded-lg bg-white flex items-center justify-center">
                          {/* photo entiere ; un prix deja ecrit dedans est recouvert par le prix actuel */}
                          <PhotoPrix product={p} size="tile" entiere />
                        </div>
                        <p className="mt-1 text-[11px] sm:text-xs font-semibold leading-tight text-gray-900 line-clamp-2">{p.name}</p>
                        {format(p) && <p className="text-[10px] sm:text-[11px] text-gray-500 leading-tight">{format(p)}</p>}
                        {promo && <p className="text-[10px] text-gray-400 line-through leading-tight">{money(p.price)}</p>}
                        <p className="mt-auto w-full rounded-full text-white text-[11px] sm:text-xs font-bold py-0.5" style={{ background: promo ? "#d6283a" : couleur }}>
                          {money(p.effective_price)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="rounded-b-2xl px-5 py-2 text-white text-sm flex flex-wrap justify-between gap-2" style={{ background: "#0b4ea2" }}>
          <span>{[site.address, site.phone].filter(Boolean).join(" • ")}</span>
          <span>Prix en vigueur le {new Date().toLocaleDateString("fr-SN", SENEGAL_TZ)}</span>
        </footer>
      </div>
    </div>
  );
}
