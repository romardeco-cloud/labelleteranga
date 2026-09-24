"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Category, PointOfSale, api, fetchCategories, fetchPointsOfSale } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";
import { Band, BandItemIn, deleteBand, fetchBandsAdmin, saveBand } from "@/lib/engage";

type ProductLite = { id: number; name: string; price: string; is_active: boolean; category: { id: number; name: string } | null };
type Draft = {
  id: number | null;
  title: string;
  text: string;
  show_prices: boolean;
  is_active: boolean;
  order: string;
  category: string;
  include_combos: boolean;
  items: (BandItemIn & { name: string })[];
};
const empty: Draft = { id: null, title: "", text: "", show_prices: true, is_active: true, order: "0", category: "", include_combos: false, items: [] };

export default function BandsAdminPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseCat, setBrowseCat] = useState<number | "all">("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchPointsOfSale().then((list) => {
      const active = list.filter((s) => s.is_active);
      setStores(active);
      setStoreId((cur) => cur ?? active.find((s) => s.slug === "resto")?.id ?? active[0]?.id ?? null);
    });
    fetchCategories().then(setCategories);
  }, []);

  const load = useCallback(async () => {
    if (!storeId) return;
    setBands(await fetchBandsAdmin(storeId));
    const res = await api.get("/catalog/products/", { params: { point_of_sale: storeId, page_size: 1000 } });
    setProducts((res.data.results ?? res.data) as ProductLite[]);
  }, [storeId]);
  useEffect(() => {
    load();
  }, [load]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => p.is_active && (!s || p.name.toLowerCase().includes(s))).slice(0, 30);
  }, [products, q]);

  const browseCategories = useMemo(() => {
    const ids = new Set(products.filter((p) => p.is_active && p.category).map((p) => p.category!.id));
    return categories.filter((c) => ids.has(c.id));
  }, [products, categories]);

  const browseMatches = useMemo(() => {
    if (browseCat === "all") return products.filter((p) => p.is_active);
    return products.filter((p) => p.is_active && p.category?.id === browseCat);
  }, [products, browseCat]);

  function edit(b: Band) {
    setDraft({
      id: b.id,
      title: b.title,
      text: b.text,
      show_prices: b.show_prices,
      is_active: b.is_active,
      order: String(b.order),
      category: b.category ? String(b.category) : "",
      include_combos: b.include_combos,
      items: b.items_out.map((i) => ({ product: i.product, name: i.name, subtitle: i.subtitle })),
    });
    setMsg("");
    setQ("");
    setBrowseOpen(false);
    setBrowseCat("all");
  }

  async function save() {
    if (!draft || !storeId) return;
    if (!draft.title.trim()) return setMsg("Donnez un titre a la bande.");
    setBusy(true);
    setMsg("");
    try {
      await saveBand(draft.id, {
        point_of_sale: storeId,
        title: draft.title.trim(),
        text: draft.text,
        show_prices: draft.show_prices,
        is_active: draft.is_active,
        order: Number(draft.order) || 0,
        category: draft.category ? Number(draft.category) : null,
        include_combos: draft.include_combos,
        items: draft.items.map((i) => ({ product: i.product, subtitle: i.subtitle })),
      });
      setDraft(null);
      load();
    } catch (err) {
      setMsg(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const move = (i: number, d: number) =>
    setDraft((cur) => {
      if (!cur) return cur;
      const items = [...cur.items];
      const j = i + d;
      if (j < 0 || j >= items.length) return cur;
      [items[i], items[j]] = [items[j], items[i]];
      return { ...cur, items };
    });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bandes de pub du site</h1>
          <p className="text-sm text-gray-500">
            Des bandes comme « Nos Pizzas Artisanales » ou « Nos Combos », affichees en haut du site : titre, texte, et cartes de plats avec photo et prix. Une bande sans plat a
            afficher reste cachee.
          </p>
        </div>
        <select value={storeId ?? ""} onChange={(e) => setStoreId(Number(e.target.value))} className="border rounded-lg px-3 py-2">
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => (setDraft({ ...empty }), setMsg(""), setQ(""), setBrowseOpen(false), setBrowseCat("all"))}
        className="bg-[#b3261e] text-white rounded-lg px-4 py-2 font-medium"
      >
        + Nouvelle bande
      </button>

      <div className="space-y-3">
        {bands.map((b) => (
          <div key={b.id} className={`border rounded-2xl bg-[#1c1514] p-4 flex flex-wrap items-center gap-3 ${b.is_active ? "" : "opacity-60"}`}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{b.title}</p>
              <p className="text-xs text-gray-500">
                {b.items_out.length > 0 ? `${b.items_out.length} plat(s) choisi(s) a la main` : b.category_name ? `Automatique : categorie « ${b.category_name} »` : b.include_combos ? "Automatique : combos actifs" : "Aucun plat"}
                {b.items_out.length === 0 && b.category_name && b.include_combos ? " + combos actifs" : ""}
                {!b.is_active && " · desactivee"}
              </p>
            </div>
            <button onClick={() => edit(b)} className="border rounded-lg px-3 py-1.5 text-sm">
              Modifier
            </button>
            <button
              onClick={async () => {
                if (confirm(`Supprimer la bande « ${b.title} » ?`)) {
                  await deleteBand(b.id);
                  load();
                }
              }}
              className="border border-red-500/40 text-red-400 rounded-lg px-3 py-1.5 text-sm"
            >
              Supprimer
            </button>
          </div>
        ))}
        {bands.length === 0 && <p className="text-center text-gray-500 border rounded-2xl py-10">Aucune bande pour ce point de vente.</p>}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 bg-black/70 overflow-y-auto p-4" onClick={() => setDraft(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-w-2xl mx-auto my-6 bg-[#1c1514] border rounded-2xl p-5 space-y-4">
            <h2 className="text-lg font-semibold">{draft.id ? "Modifier la bande" : "Nouvelle bande"}</h2>
            <label className="block text-sm">
              <span className="block text-gray-400 mb-1">Titre</span>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Nos Pizzas Artisanales" className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="block text-gray-400 mb-1">Texte</span>
              <textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2" />
            </label>

            <div className="border rounded-xl p-3 space-y-3">
              <p className="text-sm font-medium">Quels plats afficher ?</p>
              <label className="block text-sm">
                <span className="block text-gray-400 mb-1">Automatique : tous les produits actifs d&apos;une categorie (les tailles d&apos;un meme plat sont regroupees)</span>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-full border rounded-lg px-3 py-2">
                  <option value="">— aucune —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.include_combos} onChange={(e) => setDraft({ ...draft, include_combos: e.target.checked })} /> Ajouter aussi les combos actifs (avec leur photo et leur prix)
              </label>
              <div className="text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-gray-400">Ou choisir les plats a la main (prioritaire sur la categorie)</span>
                  <button
                    type="button"
                    onClick={() => setBrowseOpen((v) => !v)}
                    className={`shrink-0 border rounded-lg px-2.5 py-1 text-xs ${browseOpen ? "bg-white/10" : ""}`}
                  >
                    📂 Parcourir
                  </button>
                </div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un produit..." className="w-full border rounded-lg px-3 py-2" />
                {q.trim() && (
                  <ul className="mt-1 max-h-44 overflow-y-auto border rounded-lg divide-y">
                    {matches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!draft.items.some((i) => i.product === p.id)) setDraft({ ...draft, items: [...draft.items, { product: p.id, name: p.name, subtitle: "" }] });
                            setQ("");
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-white/5"
                        >
                          {p.name} <span className="text-gray-500">· {Number(p.price).toLocaleString("fr-FR")} FCFA</span>
                        </button>
                      </li>
                    ))}
                    {matches.length === 0 && <li className="px-3 py-2 text-gray-500">Aucun produit actif.</li>}
                  </ul>
                )}
                {browseOpen && (
                  <div className="mt-2 border rounded-lg p-2">
                    <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <button
                        type="button"
                        onClick={() => setBrowseCat("all")}
                        className={`shrink-0 rounded-full px-3 py-1 text-xs border ${browseCat === "all" ? "bg-[#b3261e] border-[#b3261e]" : ""}`}
                      >
                        Toutes
                      </button>
                      {browseCategories.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setBrowseCat(c.id)}
                          className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs border ${browseCat === c.id ? "bg-[#b3261e] border-[#b3261e]" : ""}`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                    <ul className="max-h-44 overflow-y-auto divide-y">
                      {browseMatches.map((p) => {
                        const picked = draft.items.some((i) => i.product === p.id);
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              disabled={picked}
                              onClick={() => setDraft({ ...draft, items: [...draft.items, { product: p.id, name: p.name, subtitle: "" }] })}
                              className={`w-full text-left px-3 py-1.5 hover:bg-white/5 ${picked ? "opacity-40" : ""}`}
                            >
                              {picked ? "✓ " : ""}
                              {p.name} <span className="text-gray-500">· {Number(p.price).toLocaleString("fr-FR")} FCFA</span>
                            </button>
                          </li>
                        );
                      })}
                      {browseMatches.length === 0 && <li className="px-3 py-2 text-gray-500">Aucun produit actif dans cette categorie.</li>}
                    </ul>
                  </div>
                )}
                {draft.items.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {draft.items.map((it, i) => (
                      <li key={it.product} className="flex items-center gap-2">
                        <span className="w-6 text-gray-500">{i + 1}.</span>
                        <span className="flex-1 min-w-0 truncate">{it.name}</span>
                        <input
                          value={it.subtitle}
                          maxLength={80}
                          onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, k) => (k === i ? { ...x, subtitle: e.target.value } : x)) })}
                          placeholder="Sous-titre (facultatif)"
                          className="w-44 border rounded-lg px-2 py-1 text-xs"
                        />
                        <button type="button" onClick={() => move(i, -1)} className="px-1.5 border rounded">
                          ↑
                        </button>
                        <button type="button" onClick={() => move(i, 1)} className="px-1.5 border rounded">
                          ↓
                        </button>
                        <button type="button" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, k) => k !== i) })} className="px-1.5 border rounded text-red-400">
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.show_prices} onChange={(e) => setDraft({ ...draft, show_prices: e.target.checked })} /> Afficher les prix
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Bande active (visible sur le site)
              </label>
              <label className="block">
                <span className="block text-gray-400 mb-1">Ordre d&apos;affichage (0 = en premier)</span>
                <input type="number" min={0} value={draft.order} onChange={(e) => setDraft({ ...draft, order: e.target.value })} className="w-24 border rounded-lg px-3 py-1.5" />
              </label>
            </div>

            {msg && <p className="text-sm text-red-400">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="border rounded-lg px-4 py-2">
                Annuler
              </button>
              <button onClick={save} disabled={busy} className="bg-[#b3261e] text-white rounded-lg px-5 py-2 font-medium disabled:opacity-50">
                {busy ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
