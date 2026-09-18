"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/admin/Icon";
import { Category, PointOfSale, fetchCategories, fetchPointsOfSale } from "@/lib/api";
import { categoryEmoji } from "@/lib/branding";
import { apiErrorMessage } from "@/lib/documents";
import {
  StoreCategory,
  addStoreCategory,
  fetchStoreCategories,
  removeStoreCategory,
  setStoreCategoryOrder,
} from "@/lib/store-admin";

export default function AdminCategoriesPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [links, setLinks] = useState<StoreCategory[]>([]);
  const [all, setAll] = useState<Category[]>([]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPointsOfSale().then((list) => {
      const active = list.filter((s) => s.is_active);
      setStores(active);
      setStoreId((cur) => cur ?? active[0]?.id ?? null);
    });
    fetchCategories().then(setAll);
  }, []);

  const load = useCallback(() => {
    if (storeId) fetchStoreCategories(storeId).then(setLinks);
  }, [storeId]);
  useEffect(load, [load]);

  const store = stores.find((s) => s.id === storeId);
  const linkedIds = new Set(links.map((l) => l.category));
  const available = all.filter((c) => !linkedIds.has(c.id));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    setBusy(true);
    setError("");
    try {
      await addStoreCategory(storeId, pick ? { category: Number(pick) } : { name });
      setPick("");
      setName("");
      setAdding(false);
      fetchCategories().then(setAll);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, "Ajout impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function changeOrder(l: StoreCategory, value: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n === l.order) return;
    await setStoreCategoryOrder(l.id, n);
    load();
  }

  async function remove(l: StoreCategory) {
    if (
      !confirm(
        `Retirer "${l.name}" de ${store?.name} ?\n\nLes produits ne sont pas supprimes : la categorie disparait seulement des filtres de ce point de vente.`
      )
    )
      return;
    await removeStoreCategory(l.id);
    load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-sm text-gray-500">
            {links.length} categorie{links.length > 1 ? "s" : ""} · {store?.name ?? "..."}
          </p>
        </div>
        <button
          onClick={() => {
            setAdding(!adding);
            setError("");
          }}
          className="flex items-center gap-2 bg-brand text-white rounded-xl px-4 py-2.5 text-sm font-medium"
        >
          <Icon name="plus" className="w-4 h-4" /> Ajouter
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border rounded-xl p-1 bg-[#1c1514] w-fit max-w-full">
        {stores.map((s) => (
          <button
            key={s.id}
            onClick={() => setStoreId(s.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${storeId === s.id ? "bg-[#b3261e] text-white" : "text-gray-500 hover:text-white"}`}
          >
            {s.name.replace(/ La Belle Teranga$/i, "")}
          </button>
        ))}
      </div>

      {adding && (
        <form onSubmit={add} className="border rounded-xl bg-[#1c1514] p-4 grid sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Categorie existante</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="w-full border rounded-lg px-3 py-2">
              <option value="">— choisir —</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <span className="text-gray-500 text-sm pb-2 text-center">ou</span>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Nouvelle categorie</span>
            <input
              value={name}
              disabled={!!pick}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. MENU ENFANT"
              className="w-full border rounded-lg px-3 py-2 disabled:opacity-40"
            />
          </label>
          <button disabled={busy || (!pick && !name.trim())} className="bg-brand text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40">
            Ajouter
          </button>
          {error && <p className="text-sm text-red-500 sm:col-span-4">{error}</p>}
        </form>
      )}

      <div className="space-y-3">
        {links.map((l) => (
          <div key={l.id} className="border rounded-2xl bg-[#1c1514] px-4 py-3.5 flex items-center gap-4">
            <span className="w-11 h-11 rounded-xl bg-[#b3261e]/20 flex items-center justify-center text-xl shrink-0">
              {categoryEmoji(l.name)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{l.name}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500">
                <label className="flex items-center gap-1">
                  Ordre :
                  <input
                    key={`${l.id}-${l.order}`}
                    type="number"
                    min={0}
                    defaultValue={l.order}
                    onBlur={(e) => changeOrder(l, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    className="w-14 border rounded-md px-1.5 py-0.5 text-center text-white"
                  />
                </label>
                {l.stock_total > 0 ? (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-xs">
                    {l.products_count} en caisse · stock {l.stock_total}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 text-xs">Sans stock</span>
                )}
                {l.hidden_count > 0 && (
                  <Link
                    href="/admin/products"
                    className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 text-xs"
                    title="Ces produits sont masques (inactifs) : ils n'apparaissent ni en caisse ni sur le site. Activez-les dans Produits."
                  >
                    {l.hidden_count} masque{l.hidden_count > 1 ? "s" : ""} (absents de la caisse)
                  </Link>
                )}
              </div>
            </div>
            <button onClick={() => remove(l)} aria-label="Retirer" className="text-gray-500 hover:text-red-400 p-2">
              <Icon name="trash" className="w-4 h-4" />
            </button>
          </div>
        ))}
        {links.length === 0 && (
          <p className="text-center text-gray-500 border rounded-xl bg-[#1c1514] py-10">
            Aucune categorie pour ce point de vente. Cliquez sur « Ajouter » ou importez son fichier de produits.
          </p>
        )}
      </div>
      <p className="text-xs text-gray-500">
        L&apos;ordre commande l&apos;affichage des filtres de categories a la caisse de ce point de vente. Retirer une categorie ne supprime aucun
        produit.
      </p>
    </div>
  );
}
