"use client";

import { useState } from "react";
import { PointOfSale, Product, api, updateProduct } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

type Ligne = { id?: number; label: string; price: string; is_active: boolean; stock: string; stockInitial: string; base: string; prixInitial: string };

const money = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";

/**
 * Admin > Produits : formats d'un produit (taille, grandeur, poids conditionne) avec leur prix et leur stock dans le
 * point de vente choisi, ou vente au poids (prix du produit = prix au kilo). Le client et le caissier choisissent
 * ensuite le format ou le poids au moment de l'achat.
 */
export default function FormatsEditor({
  product,
  store,
  onClose,
  onSaved,
}: {
  product: Product;
  store: PointOfSale | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const stockDe = (stocks?: Record<string, number>) => (store ? String(stocks?.[String(store.id)] ?? 0) : "");
  // magasin avec supplement (ex. Ziguinchor) : les prix saisis ne valent que pour lui
  const prixMagasin = Boolean(store && (Number(store.price_markup_percent ?? 0) > 0 || Number(store.price_markup_amount ?? 0) > 0));
  const [auPoids, setAuPoids] = useState(Boolean(product.sold_by_weight));
  const [lignes, setLignes] = useState<Ligne[]>(
    (product.variants ?? []).map((v) => {
      const prix = String(Number(v.price));
      return { id: v.id, label: v.label, price: prix, prixInitial: prix, base: String(Number(v.base_price ?? v.price)), is_active: v.is_active, stock: stockDe(v.stocks), stockInitial: stockDe(v.stocks) };
    })
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const maj = (i: number, champ: Partial<Ligne>) => setLignes((l) => l.map((x, j) => (j === i ? { ...x, ...champ } : x)));
  const ajouter = (label = "", price = "") => setLignes((l) => [...l, { label, price, prixInitial: "", base: price, is_active: true, stock: store ? "0" : "", stockInitial: "" }]);

  async function enregistrer() {
    setBusy(true);
    setMsg("");
    try {
      const formats = lignes.filter((l) => l.label.trim());
      let p = await updateProduct(product.id, {
        sold_by_weight: auPoids && formats.length === 0,
        // prix de base commun ; dans un magasin a supplement, un nouveau format prend le prix saisi comme base
        variants: formats.map((l) => ({ id: l.id, label: l.label.trim(), price: prixMagasin && l.id ? l.base : l.price || "0", is_active: l.is_active })),
      });
      // prix propres a ce magasin (seulement ceux modifies) : les autres magasins ne changent pas
      if (prixMagasin && store) {
        for (const l of formats) {
          if (!l.id || l.price === l.prixInitial) continue;
          const v = (p.variants ?? []).find((x) => x.id === l.id);
          if (!v) continue;
          const { data } = await api.post<Product>(`/catalog/products/${product.id}/store-price/`, { point_of_sale: store.id, variant: v.id, price: l.price });
          p = data;
        }
      }
      // stock de chaque format dans le point de vente choisi (seulement ceux modifies)
      if (store) {
        for (const l of formats) {
          if (l.stock === l.stockInitial && l.id) continue;
          const v = (p.variants ?? []).find((x) => (l.id ? x.id === l.id : x.label === l.label.trim()));
          if (!v) continue;
          const { data } = await api.post<Product>(`/catalog/products/${product.id}/variant-stock/`, {
            variant: v.id,
            point_of_sale: store.id,
            quantity: Number(l.stock || 0),
          });
          p = data;
        }
      }
      onSaved(p);
      onClose();
    } catch (err) {
      setMsg(apiErrorMessage(err, "Formats non enregistres."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xl max-h-[95vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="font-bold text-lg">Formats et poids : {product.name}</h2>
          <p className="text-sm text-gray-600">
            Le client (site web) et le caissier choisiront le format ou le poids au moment de l&apos;achat ; le prix suit automatiquement.
          </p>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-sm">Formats (taille, grandeur, poids conditionné) avec leur prix</p>
          {prixMagasin && store && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
              Prix de {store.name} (supplément{" "}
              {[Number(store.price_markup_percent ?? 0) > 0 && `${Number(store.price_markup_percent)} %`, Number(store.price_markup_amount ?? 0) > 0 && `${store.price_markup_amount} F`]
                .filter(Boolean)
                .join(" + ")}{" "}
              inclus). Un prix modifié ici ne vaut que pour ce magasin : les
              autres magasins ne changent pas.
            </p>
          )}
          {lignes.length === 0 && <p className="text-xs text-gray-500">Aucun format : le produit se vend à son prix unique ({money(product.price)}).</p>}
          {lignes.map((l, i) => (
            <div key={l.id ?? `n${i}`} className="flex flex-wrap items-center gap-2">
              <input value={l.label} onChange={(e) => maj(i, { label: e.target.value })} placeholder="Format (ex. Sac 25 kg)" className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[140px]" />
              <input
                value={l.price}
                onChange={(e) => maj(i, { price: e.target.value.replace(/[^0-9]/g, "") })}
                inputMode="numeric"
                placeholder="Prix"
                className="border rounded px-2 py-1.5 text-sm w-24 text-right"
                aria-label="Prix en FCFA"
              />
              <span className="text-xs text-gray-500">FCFA</span>
              {store && (
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  Stock
                  <input value={l.stock} onChange={(e) => maj(i, { stock: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" className="border rounded px-2 py-1.5 text-sm w-16 text-right" />
                </label>
              )}
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={l.is_active} onChange={(e) => maj(i, { is_active: e.target.checked })} /> En vente
              </label>
              <button onClick={() => setLignes((x) => x.filter((_, j) => j !== i))} className="text-red-500 text-xs underline">
                Retirer
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => ajouter()} className="border border-brand text-brand rounded-lg px-3 py-1.5 text-sm">
              + Ajouter un format
            </button>
            {lignes.length === 0 &&
              (
                [
                  ["Petit", "Moyen", "Grand"],
                  ["500 g", "1 kg", "5 kg", "25 kg"],
                  ["50 cl", "1 L", "1,5 L"],
                ] as const
              ).map((modele) => (
                <button key={modele.join()} onClick={() => modele.forEach((m) => ajouter(m))} className="border rounded-lg px-3 py-1.5 text-xs text-gray-600">
                  {modele.join(" / ")}
                </button>
              ))}
          </div>
          {store ? (
            <p className="text-xs text-gray-500">Stock du point de vente : {store.name}. Chaque format a son propre stock et sa propre rupture.</p>
          ) : (
            <p className="text-xs text-amber-600">Choisissez un point de vente (en haut de la liste) pour saisir le stock de chaque format.</p>
          )}
        </div>

        <label className={`flex items-start gap-2 text-sm rounded-lg border p-3 ${lignes.some((l) => l.label.trim()) ? "opacity-50" : ""}`}>
          <input type="checkbox" checked={auPoids} disabled={lignes.some((l) => l.label.trim())} onChange={(e) => setAuPoids(e.target.checked)} className="mt-0.5" />
          <span>
            <strong>Vendu au poids</strong> : le prix du produit ({money(product.price)}) devient le prix au kilo, et on saisit le poids voulu (ex. 1,350 kg)
            à l&apos;achat. Pas de suivi de stock en unités. Sans effet si des formats sont définis.
          </span>
        </label>

        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">
            Annuler
          </button>
          <button disabled={busy} onClick={enregistrer} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40">
            {busy ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
