"use client";

import { useState } from "react";
import { prixSpecial } from "@/lib/productLabel";

export type FormatChoix = { id: number; label: string; effective_price: string; price?: string; stock?: number | null };
export type Choix = { variant?: number; weight_kg?: number; quantity: number };

const money = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";
const ILLIMITE = 999999;

/** Produit a choisir : avec des formats (prix propre a chacun) ou vendu au poids (prix au kilo). */
export function aChoisir(p: { sold_by_weight?: boolean; variants?: unknown[] | null }) {
  return Boolean(p.sold_by_weight) || (p.variants?.length ?? 0) > 0;
}

/** "a partir de 700 FCFA" / "800 FCFA / kg" / prix simple. */
export function prixAffiche(p: { sold_by_weight?: boolean; variants?: { effective_price: string; is_active?: boolean }[] | null; effective_price: string }) {
  return prixSpecial(p as Parameters<typeof prixSpecial>[0]) ?? money(p.effective_price);
}

/**
 * Fenetre de choix : format (taille, grandeur, poids conditionne) avec son prix, ou poids libre pour un produit vendu
 * au kilo (prix calcule). Utilisee par la boutique (fiche, carte produit) et par la caisse.
 */
export default function ChoixFormat({
  nom,
  formats,
  prixKg,
  quantiteLibre = true,
  confirmer = "Ajouter au panier",
  onChoix,
  onClose,
}: {
  nom: string;
  formats?: FormatChoix[] | null;
  /** prix au kilo si le produit est vendu au poids (sans formats) */
  prixKg?: string | null;
  quantiteLibre?: boolean;
  confirmer?: string;
  onChoix: (c: Choix) => void | Promise<void>;
  onClose: () => void;
}) {
  const liste = formats ?? [];
  const premier = liste.find((f) => f.stock == null || f.stock > 0) ?? liste[0];
  const [format, setFormat] = useState<number | undefined>(premier?.id);
  const [poids, setPoids] = useState("1");
  const [qte, setQte] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const auPoids = !liste.length && prixKg != null;
  const kg = Number(poids.replace(",", "."));
  const choisi = liste.find((f) => f.id === format);
  const total = auPoids ? (kg > 0 ? Math.round(Number(prixKg) * kg) : 0) : choisi ? Number(choisi.effective_price) * qte : 0;
  const stockMax = choisi && choisi.stock != null && choisi.stock < ILLIMITE ? choisi.stock : undefined;
  const valide = auPoids ? kg > 0 && kg <= 1000 : Boolean(choisi) && (stockMax == null || (stockMax > 0 && qte <= stockMax));

  async function valider() {
    if (!valide) return;
    setBusy(true);
    setErr("");
    try {
      await onChoix(auPoids ? { weight_kg: Math.round(kg * 1000) / 1000, quantity: 1 } : { variant: format, quantity: qte });
      onClose();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data;
      setErr(d?.detail ?? "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-bold text-lg text-brand-dark">{nom}</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none" aria-label="Fermer">
            ×
          </button>
        </div>

        {auPoids ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Prix au kilo : <strong>{money(prixKg!)}</strong>. Indiquez le poids voulu :
            </p>
            <div className="flex flex-wrap gap-2">
              {["0.25", "0.5", "1", "2", "5"].map((v) => (
                <button key={v} onClick={() => setPoids(v)} className={`border rounded-lg px-3 py-1.5 text-sm font-medium ${poids === v ? "bg-brand text-white border-brand" : ""}`}>
                  {v.replace(".", ",")} kg
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              Autre poids
              <input
                inputMode="decimal"
                value={poids.replace(".", ",")}
                onChange={(e) => setPoids(e.target.value.replace(/[^0-9.,]/g, ""))}
                className="w-24 border rounded px-2 py-1.5 text-right"
                aria-label="Poids en kg"
              />
              kg
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Choisissez le format :</p>
            <div className="grid grid-cols-2 gap-2">
              {liste.map((f) => {
                const rupture = f.stock != null && f.stock <= 0;
                const promo = f.price && Number(f.effective_price) < Number(f.price);
                return (
                  <button
                    key={f.id}
                    disabled={rupture}
                    onClick={() => {
                      setFormat(f.id);
                      setQte(1);
                    }}
                    className={`border-2 rounded-xl p-2.5 text-left disabled:opacity-40 ${format === f.id ? "border-brand bg-brand-light" : "border-gray-200"}`}
                  >
                    <span className="block font-bold text-sm">{f.label}</span>
                    {promo && <span className="block text-xs text-gray-400 line-through">{money(f.price!)}</span>}
                    <span className={`block text-sm font-semibold ${promo ? "text-red-600" : "text-brand-dark"}`}>{money(f.effective_price)}</span>
                    {rupture && <span className="block text-xs text-red-600">Rupture</span>}
                  </button>
                );
              })}
            </div>
            {quantiteLibre && (
              <div className="flex items-center gap-3 text-sm">
                Quantité
                <button onClick={() => setQte((q) => Math.max(1, q - 1))} className="w-8 h-8 border rounded-lg font-bold" aria-label="Moins">
                  −
                </button>
                <span className="w-6 text-center font-semibold">{qte}</span>
                <button onClick={() => setQte((q) => (stockMax != null ? Math.min(stockMax, q + 1) : q + 1))} className="w-8 h-8 border rounded-lg font-bold" aria-label="Plus">
                  +
                </button>
                {stockMax != null && <span className="text-xs text-gray-400">{stockMax} en stock</span>}
              </div>
            )}
          </div>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={!valide || busy} onClick={valider} className="w-full bg-brand text-white rounded-xl py-3 font-semibold disabled:opacity-40">
          {busy ? "..." : `${confirmer} · ${money(total)}`}
        </button>
      </div>
    </div>
  );
}
