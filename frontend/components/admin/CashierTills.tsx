"use client";

import { useCallback, useEffect, useState } from "react";
import { DailyClosing, api } from "@/lib/api";
import { apiErrorMessage, formatXof } from "@/lib/documents";

type Till = {
  id: number;
  username: string;
  point_of_sale: number;
  point_of_sale_name: string;
  sales_count: number;
  expected_total: number;
  closed: boolean;
  discrepancy_total: string | null;
  closing: DailyClosing | null;
};

type Preview = {
  username: string;
  point_of_sale_name: string;
  sales_count: number;
  expected: { card: number; wave: number; orange_money: number; cash: number };
  closing: DailyClosing | null;
};

const METHODS = [
  { key: "cash", label: "Especes" },
  { key: "wave", label: "Wave" },
  { key: "orange_money", label: "Orange Money" },
  { key: "card", label: "Carte bancaire" },
] as const;

/** Caisses des caissiers : l'administrateur peut fermer (ou corriger) la caisse de chacun pour un jour donne. */
export default function CashierTills({ date, storeId, onChanged }: { date: string; storeId: number | null; onChanged: () => void }) {
  const [tills, setTills] = useState<Till[]>([]);
  const [open, setOpen] = useState<Till | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [declared, setDeclared] = useState<Record<string, string>>({ cash: "", wave: "", orange_money: "", card: "" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get<Till[]>("/reports/closings/cashiers/", { params: { date, ...(storeId ? { point_of_sale: storeId } : {}) } })
      .then((r) => setTills(r.data))
      .catch(() => setTills([]));
  }, [date, storeId]);
  useEffect(load, [load]);

  async function openForm(t: Till) {
    setOpen(t);
    setError("");
    setPreview(null);
    const { data } = await api.get<Preview>("/reports/closings/cashier-preview/", { params: { date, cashier: t.id } });
    setPreview(data);
    const c = data.closing;
    setDeclared(
      c
        ? {
            cash: String(Number(c.declared_cash)),
            wave: String(Number(c.declared_wave)),
            orange_money: String(Number(c.declared_orange_money)),
            card: String(Number(c.declared_card)),
          }
        : // pre-rempli avec l'attendu : on ne corrige que les ecarts constates au comptage
          {
            cash: String(data.expected.cash),
            wave: String(data.expected.wave),
            orange_money: String(data.expected.orange_money),
            card: String(data.expected.card),
          }
    );
    setNotes(c?.notes ?? "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/reports/closings/close-cashier/", {
        date,
        cashier: open.id,
        declared_cash: Number(declared.cash || 0),
        declared_wave: Number(declared.wave || 0),
        declared_orange_money: Number(declared.orange_money || 0),
        declared_card: Number(declared.card || 0),
        notes,
      });
      setOpen(null);
      load();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "Fermeture impossible."));
    } finally {
      setBusy(false);
    }
  }

  const gap = (m: string) => Number(declared[m] || 0) - Number(preview?.expected[m as keyof Preview["expected"]] ?? 0);

  return (
    <section className="border rounded-lg bg-white p-4 space-y-3">
      <div>
        <h2 className="font-semibold">Caisses des caissiers</h2>
        <p className="text-sm text-gray-500">
          Fermez la caisse d&apos;un caissier a sa place (oubli, depart...) ou corrigez son comptage pour la journee choisie.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pb-2">Caissier</th>
              <th className="pb-2">Point de vente</th>
              <th className="pb-2 text-right">Ventes</th>
              <th className="pb-2 text-right">Attendu</th>
              <th className="pb-2">Etat</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {tills.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="py-2 font-medium">{t.username}</td>
                <td className="py-2">{t.point_of_sale_name}</td>
                <td className="py-2 text-right">{t.sales_count}</td>
                <td className="py-2 text-right">{formatXof(t.expected_total)}</td>
                <td className="py-2">
                  {t.closed ? (
                    <span className={Number(t.discrepancy_total) === 0 ? "text-green-600" : "text-red-600"}>
                      Fermee · ecart {Number(t.discrepancy_total) > 0 ? "+" : ""}
                      {formatXof(Number(t.discrepancy_total))}
                    </span>
                  ) : (
                    <span className="text-amber-600">Ouverte</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button onClick={() => openForm(t)} className="text-xs bg-brand text-white rounded px-3 py-1.5">
                    {t.closed ? "Corriger" : "Fermer la caisse"}
                  </button>
                </td>
              </tr>
            ))}
            {tills.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">
                  Aucun caissier pour ce point de vente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 w-full max-w-lg space-y-4">
            <div>
              <h3 className="font-bold text-lg">
                {open.closed ? "Corriger" : "Fermer"} la caisse de {open.username}
              </h3>
              <p className="text-sm text-gray-500">
                {open.point_of_sale_name} · journee du {date} · {preview?.sales_count ?? 0} vente(s)
              </p>
            </div>
            {!preview ? (
              <p className="text-gray-500">Chargement...</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th>Moyen</th>
                    <th>Attendu</th>
                    <th>Compte</th>
                    <th>Ecart</th>
                  </tr>
                </thead>
                <tbody>
                  {METHODS.map((m) => (
                    <tr key={m.key} className="border-t">
                      <td className="py-1.5">{m.label}</td>
                      <td>{formatXof(preview.expected[m.key])}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={declared[m.key]}
                          onChange={(e) => setDeclared({ ...declared, [m.key]: e.target.value })}
                          className="w-28 border rounded px-2 py-1"
                        />
                      </td>
                      <td className={gap(m.key) === 0 ? "text-green-600" : "text-red-600 font-medium"}>
                        {gap(m.key) > 0 ? "+" : ""}
                        {formatXof(gap(m.key))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <label className="block text-sm">
              Remarque (facultatif)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border rounded px-3 py-2 mt-1" />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button disabled={busy || !preview} className="flex-1 bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
                {busy ? "Enregistrement..." : open.closed ? "Enregistrer la correction" : "Fermer la caisse"}
              </button>
              <button type="button" onClick={() => setOpen(null)} className="border rounded-lg px-4">
                Annuler
              </button>
            </div>
            <p className="text-xs text-gray-500">
              La fermeture est enregistree au nom de l&apos;administrateur. Si la journee est celle d&apos;aujourd&apos;hui, le caissier ne peut plus vendre.
            </p>
          </form>
        </div>
      )}
    </section>
  );
}
