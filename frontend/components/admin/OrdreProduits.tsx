"use client";

import { useEffect, useMemo, useState } from "react";
import ProductVisual from "@/components/ProductVisual";
import { PointOfSale, Product, api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

/**
 * Admin > Produits : arranger l'ordre d'affichage des produits sur le site d'un magasin.
 * Ordinateur : glisser-deposer une vignette. Telephone : toucher un produit, puis toucher la place voulue (ou les fleches).
 * Avec une categorie choisie, seuls ses produits changent de place entre eux ; les autres gardent la leur.
 */
export default function OrdreProduits({ store, onClose, onSaved }: { store: PointOfSale; onClose: () => void; onSaved: () => void }) {
  const [tous, setTous] = useState<Product[]>([]);
  const [ordre, setOrdre] = useState<Product[]>([]);
  const [categorie, setCategorie] = useState<number | "">("");
  const [choisi, setChoisi] = useState<number | null>(null);
  const [glisse, setGlisse] = useState<number | null>(null);
  const [modifie, setModifie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const all: Product[] = [];
      for (let page = 1; ; page++) {
        const res = await api.get("/catalog/products/", { params: { point_of_sale: store.id, is_active: "true", page_size: 500, page } });
        all.push(...(res.data.results ?? res.data));
        if (!res.data.next) break;
      }
      setTous(all);
      setOrdre(all);
    })().catch((err) => setMsg(apiErrorMessage(err, "Produits non charges.")));
  }, [store.id]);

  const categories = useMemo(() => {
    const m = new Map<number, string>();
    tous.forEach((p) => p.category && m.set(p.category.id, p.category.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tous]);

  function changerCategorie(v: number | "") {
    if (modifie && !confirm("Les changements non enregistres seront perdus. Continuer ?")) return;
    setCategorie(v);
    setOrdre(v ? tous.filter((p) => p.category?.id === v) : tous);
    setChoisi(null);
    setModifie(false);
  }

  function deplacer(de: number, vers: number) {
    if (de === vers || vers < 0 || vers >= ordre.length) return;
    setOrdre((l) => {
      const copie = [...l];
      const [p] = copie.splice(de, 1);
      copie.splice(vers, 0, p);
      return copie;
    });
    setModifie(true);
  }

  function toucher(i: number) {
    if (choisi === null) return setChoisi(i);
    if (choisi !== i) deplacer(choisi, i);
    setChoisi(null);
  }

  async function enregistrer() {
    setBusy(true);
    setMsg("");
    try {
      await api.post("/catalog/products/reorder/", { point_of_sale: store.id, ids: ordre.map((p) => p.id) });
      setModifie(false);
      onSaved();
      onClose();
    } catch (err) {
      setMsg(apiErrorMessage(err, "Ordre non enregistre."));
    } finally {
      setBusy(false);
    }
  }

  const fermer = () => (!modifie || confirm("Fermer sans enregistrer le nouvel ordre ?")) && onClose();

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4" onClick={fermer}>
      <div className="bg-white rounded-2xl w-full max-w-6xl h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-lg">Arranger l&apos;ordre des produits : {store.name}</h2>
            <select value={categorie} onChange={(e) => changerCategorie(e.target.value ? Number(e.target.value) : "")} className="border rounded px-3 py-1.5 text-sm">
              <option value="">Tous les produits ({tous.length})</option>
              {categories.map(([id, nom]) => (
                <option key={id} value={id}>
                  {nom}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-600">
            Glissez une vignette à sa nouvelle place, ou touchez un produit puis touchez la place voulue. Le site affiche les produits dans cet
            ordre (les premiers sont vus en premier).{categorie !== "" && " Seuls les produits de cette catégorie changent de place entre eux."}
          </p>
          {choisi !== null && ordre[choisi] && (
            <div className="flex flex-wrap items-center gap-2 text-xs bg-brand-light/60 rounded p-2">
              <span className="font-medium">« {ordre[choisi].name} » : touchez la place voulue, ou</span>
              <button onClick={() => (deplacer(choisi, 0), setChoisi(0))} className="border rounded px-2 py-1 bg-white">
                ⇤ En premier
              </button>
              <button onClick={() => choisi > 0 && (deplacer(choisi, choisi - 1), setChoisi(choisi - 1))} className="border rounded px-2 py-1 bg-white">
                ← Avant
              </button>
              <button
                onClick={() => choisi < ordre.length - 1 && (deplacer(choisi, choisi + 1), setChoisi(choisi + 1))}
                className="border rounded px-2 py-1 bg-white"
              >
                Après →
              </button>
              <button onClick={() => (deplacer(choisi, ordre.length - 1), setChoisi(ordre.length - 1))} className="border rounded px-2 py-1 bg-white">
                En dernier ⇥
              </button>
              <button onClick={() => setChoisi(null)} className="underline text-gray-500">
                Annuler
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {tous.length === 0 && !msg && <p className="text-sm text-gray-500 p-4">Chargement des produits...</p>}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {ordre.map((p, i) => (
              <div
                key={p.id}
                draggable
                onDragStart={() => setGlisse(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (glisse !== null) deplacer(glisse, i);
                  setGlisse(null);
                  setChoisi(null);
                }}
                onDragEnd={() => setGlisse(null)}
                onClick={() => toucher(i)}
                className={`relative rounded-lg border bg-white cursor-grab select-none overflow-hidden transition ${
                  choisi === i ? "ring-4 ring-brand" : choisi !== null ? "hover:ring-2 hover:ring-brand/50" : "hover:shadow"
                } ${glisse === i ? "opacity-40" : ""}`}
                title={p.name}
              >
                <span className="absolute top-1 left-1 z-10 bg-black/70 text-white text-[10px] font-bold rounded px-1.5">{i + 1}</span>
                <div className="aspect-square bg-gray-50 pointer-events-none">
                  <ProductVisual image={p.image} name={p.name} category={p.category?.name} size="tile" />
                </div>
                <p className="text-[11px] leading-tight p-1 line-clamp-2 h-8">{p.name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t flex flex-wrap items-center justify-end gap-2">
          {msg && <p className="text-sm text-red-600 mr-auto">{msg}</p>}
          {modifie && !msg && <p className="text-xs text-amber-700 mr-auto">Ordre modifié : pensez à enregistrer.</p>}
          <button onClick={fermer} className="border rounded-lg px-4 py-2 text-sm">
            Fermer
          </button>
          <button disabled={!modifie || busy} onClick={enregistrer} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40">
            {busy ? "Enregistrement..." : "Enregistrer l'ordre"}
          </button>
        </div>
      </div>
    </div>
  );
}
