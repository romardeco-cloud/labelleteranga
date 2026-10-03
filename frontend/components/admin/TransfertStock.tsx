"use client";

import { useState } from "react";
import { PointOfSale, Product, api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

/**
 * Admin > Produits : transferer du stock d'un magasin a un autre (ex. 20 sacs de riz de Mbour-Saly vers Ziguinchor).
 * La sortie et l'entree sont enregistrees ensemble dans le journal des mouvements, avec une reference commune.
 */
export default function TransfertStock({
  product,
  depuis,
  magasins,
  onClose,
  onDone,
}: {
  product: Product;
  depuis: PointOfSale;
  magasins: PointOfSale[];
  onClose: () => void;
  onDone: (p: Product, message: string) => void;
}) {
  const formats = (product.variants ?? []).filter((v) => v.is_active);
  const destinations = magasins.filter((m) => m.id !== depuis.id);
  const [vers, setVers] = useState<number | "">(destinations.find((m) => /supermarch/i.test(m.name))?.id ?? destinations[0]?.id ?? "");
  const [format, setFormat] = useState<number | "">(formats[0]?.id ?? "");
  const [qte, setQte] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const dispo = (() => {
    if (formats.length) {
      const f = formats.find((x) => x.id === format);
      return f?.stocks?.[String(depuis.id)] ?? 0;
    }
    return product.stocks?.find((s) => s.point_of_sale === depuis.id)?.quantity ?? 0;
  })();
  const n = Number(qte);
  const valide = Boolean(vers) && n > 0 && Number.isInteger(n) && n <= dispo && (!formats.length || Boolean(format));

  async function transferer() {
    setBusy(true);
    setMsg("");
    try {
      const { data } = await api.post<Product>(`/catalog/products/${product.id}/transfer-stock/`, {
        from_point_of_sale: depuis.id,
        to_point_of_sale: vers,
        quantity: n,
        ...(formats.length ? { variant: format } : {}),
      });
      const cible = destinations.find((m) => m.id === vers)?.name ?? "";
      const libelle = formats.length ? ` (${formats.find((f) => f.id === format)?.label})` : "";
      onDone(data, `${n} × ${product.name}${libelle} transféré(s) de ${depuis.name} vers ${cible}.`);
      onClose();
    } catch (err) {
      setMsg(apiErrorMessage(err, "Transfert impossible."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="font-bold text-lg">Transférer du stock</h2>
          <p className="text-sm text-gray-600">{product.name}</p>
        </div>

        <div className="grid gap-3 text-sm">
          <div>
            <span className="block text-gray-500 mb-1">Depuis</span>
            <span className="font-medium">{depuis.name}</span>
          </div>
          <label className="block">
            <span className="block text-gray-500 mb-1">Vers</span>
            <select value={vers} onChange={(e) => setVers(e.target.value ? Number(e.target.value) : "")} className="w-full border rounded px-3 py-2">
              {destinations.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {formats.length > 0 && (
            <label className="block">
              <span className="block text-gray-500 mb-1">Format</span>
              <select value={format} onChange={(e) => setFormat(Number(e.target.value))} className="w-full border rounded px-3 py-2">
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} — {f.stocks?.[String(depuis.id)] ?? 0} en stock
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="block text-gray-500 mb-1">Quantité à transférer (disponible : {dispo})</span>
            <input value={qte} onChange={(e) => setQte(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" autoFocus className="w-full border rounded px-3 py-2" />
          </label>
          {n > dispo && <p className="text-xs text-red-600">Pas assez de stock dans {depuis.name} (disponible : {dispo}).</p>}
          {dispo === 0 && (
            <p className="text-xs text-amber-700">
              Aucun stock saisi pour ce {formats.length ? "format" : "produit"} dans {depuis.name} : saisissez d&apos;abord son stock (bouton « Stock » ou « Formats »).
            </p>
          )}
        </div>

        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">
            Annuler
          </button>
          <button disabled={!valide || busy} onClick={transferer} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40">
            {busy ? "Transfert..." : "Transférer"}
          </button>
        </div>
      </div>
    </div>
  );
}
