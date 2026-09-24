"use client";

import { useCallback, useEffect, useState } from "react";
import { DailyClosing, api, openCashierAdmin } from "@/lib/api";
import { apiErrorMessage, formatXof } from "@/lib/documents";

type Till = {
  id: number;
  username: string;
  point_of_sale: number;
  point_of_sale_name: string;
  sales_count: number;
  expected_total: number;
  opening_cash: number | null;
  closed: boolean;
  discrepancy_total: string | null;
  closing: DailyClosing | null;
};

type Preview = {
  username: string;
  point_of_sale_name: string;
  sales_count: number;
  expected: { card: number; wave: number; orange_money: number; cash: number };
  tips: number;
  opening_cash: number | null;
  carried_over: { card: number; wave: number; orange_money: number; cash: number } | null;
  carried_over_since: string | null;
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
  const [declaredFloat, setDeclaredFloat] = useState(""); // fond de caisse, compte et saisi separement des ventes
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const [openingFor, setOpeningFor] = useState<Till | null>(null);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingNotes, setOpeningNotes] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openingError, setOpeningError] = useState("");

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
    const openingCash = Number(data.opening_cash ?? 0);
    setDeclared(
      // exige toujours une saisie manuelle du comptage (pas de pre-remplissage avec l'attendu), meme pour une
      // premiere fermeture manuelle faite par l'administrateur
      c
        ? {
            cash: String(Number(c.declared_cash) - openingCash),
            wave: String(Number(c.declared_wave)),
            orange_money: String(Number(c.declared_orange_money)),
            card: String(Number(c.declared_card)),
          }
        : { cash: "", wave: "", orange_money: "", card: "" }
    );
    setDeclaredFloat(c ? String(openingCash) : "");
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
        // le tiroir reunit les deux : ventes du jour comptees separement + fond de caisse recompte a la fermeture
        declared_cash: Number(declared.cash || 0) + Number(declaredFloat || 0),
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

  const openingCash = Number(preview?.opening_cash ?? 0);
  const expectedFor = (m: string) => (m === "cash" ? Number(preview?.expected.cash ?? 0) - openingCash : Number(preview?.expected[m as keyof Preview["expected"]] ?? 0));
  const gap = (m: string) => Number(declared[m] || 0) - expectedFor(m);
  const floatGap = Number(declaredFloat || 0) - openingCash;
  // un ecart de caisse (n'importe quel moyen, ou le fond de caisse) doit etre explique dans la remarque
  const hasGap = METHODS.some((m) => gap(m.key) !== 0) || floatGap !== 0;

  function openOpeningForm(t: Till) {
    setOpeningFor(t);
    setOpeningAmount(t.opening_cash != null ? String(Number(t.opening_cash)) : "");
    setOpeningNotes("");
    setOpeningError("");
  }

  async function submitOpening(e: React.FormEvent) {
    e.preventDefault();
    if (!openingFor) return;
    setOpeningBusy(true);
    setOpeningError("");
    try {
      await openCashierAdmin({ date, cashier: openingFor.id, opening_cash: Number(openingAmount || 0), notes: openingNotes });
      setOpeningFor(null);
      load();
      onChanged();
    } catch (err) {
      setOpeningError(apiErrorMessage(err, "Enregistrement impossible."));
    } finally {
      setOpeningBusy(false);
    }
  }

  async function checkNow() {
    setChecking(true);
    setCheckMsg("");
    try {
      const { data } = await api.post<{ closed: number }>("/reports/closings/auto-close/");
      setCheckMsg(data.closed > 0 ? `${data.closed} journee(s) fermee(s) automatiquement.` : "Rien a fermer : toutes les caisses en retard sont a jour.");
      load();
      onChanged();
    } catch {
      setCheckMsg("Verification impossible.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <section className="border rounded-lg bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Caisses des caissiers</h2>
          <p className="text-sm text-gray-500">
            Fermez la caisse d&apos;un caissier a sa place (oubli, depart...) ou corrigez son comptage pour la journee choisie. Une caisse non
            fermee la veille avant 2h du matin est fermee automatiquement, a l&apos;equilibre.
          </p>
        </div>
        <div className="text-right">
          <button onClick={checkNow} disabled={checking} className="text-xs border rounded px-3 py-1.5 disabled:opacity-50">
            {checking ? "Verification..." : "Verifier maintenant"}
          </button>
          {checkMsg && <p className="text-xs text-gray-500 mt-1">{checkMsg}</p>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pb-2">Caissier</th>
              <th className="pb-2">Point de vente</th>
              <th className="pb-2 text-right">Ventes</th>
              <th className="pb-2 text-right">Fond de caisse</th>
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
                <td className="py-2 text-right">
                  {t.opening_cash != null ? (
                    formatXof(t.opening_cash)
                  ) : (
                    <span className="text-amber-600">Non ouverte</span>
                  )}
                </td>
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
                  {t.closing?.auto_closed && <span className="ml-2 text-xs bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">Auto</span>}
                </td>
                <td className="py-2 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => openOpeningForm(t)} className="text-xs border rounded px-3 py-1.5">
                    {t.opening_cash != null ? "Corriger fond" : "Ouvrir la caisse"}
                  </button>
                  <button onClick={() => openForm(t)} className="text-xs bg-brand text-white rounded px-3 py-1.5">
                    {t.closed ? "Corriger" : "Fermer la caisse"}
                  </button>
                </td>
              </tr>
            ))}
            {tills.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-500">
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
              {preview?.carried_over && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  ⚠️ Caisse non fermee depuis le {preview.carried_over_since} : le solde de ces jours (non retire du tiroir) est ajoute a
                  l&apos;attendu ci-dessous.
                </p>
              )}
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
                      <td className="py-1.5">{m.key === "cash" ? "Especes (ventes du jour)" : m.label}</td>
                      <td>{formatXof(expectedFor(m.key))}</td>
                      <td>
                        <input
                          required
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
                  {openingCash > 0 && (
                    <tr className="border-t">
                      <td className="py-1.5">Fond de caisse (matin)</td>
                      <td>{formatXof(openingCash)}</td>
                      <td>
                        <input
                          required
                          type="number"
                          min={0}
                          value={declaredFloat}
                          onChange={(e) => setDeclaredFloat(e.target.value)}
                          className="w-28 border rounded px-2 py-1"
                        />
                      </td>
                      <td className={floatGap === 0 ? "text-green-600" : "text-red-600 font-medium"}>
                        {floatGap > 0 ? "+" : ""}
                        {formatXof(floatGap)}
                      </td>
                    </tr>
                  )}
                  {(preview?.tips ?? 0) > 0 && (
                    <tr className="border-t text-gray-500">
                      <td className="py-1.5">dont pourboire</td>
                      <td colSpan={3}>{formatXof(preview!.tips)} — deja compris ci-dessus, sans effet sur l&apos;ecart</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            <label className="block text-sm">
              {hasGap ? (
                <span className="text-red-600 font-medium">Remarque — expliquez l&apos;ecart de caisse (obligatoire)</span>
              ) : (
                "Remarque (facultatif)"
              )}
              <textarea
                required={hasGap}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={hasGap ? "Ex. pourboire laisse dans le tiroir, erreur de rendu monnaie..." : ""}
                className={`w-full border rounded px-3 py-2 mt-1 ${hasGap ? "border-red-400" : ""}`}
              />
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

      {openingFor && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpeningFor(null)}>
          <form onSubmit={submitOpening} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div>
              <h3 className="font-bold text-lg">
                {openingFor.opening_cash != null ? "Corriger le fond de caisse" : "Ouvrir la caisse"} de {openingFor.username}
              </h3>
              <p className="text-sm text-gray-500">
                {openingFor.point_of_sale_name} · journee du {date}
              </p>
            </div>
            <label className="block text-sm">
              Fond de caisse (especes)
              <input
                required
                autoFocus
                type="number"
                min={0}
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </label>
            <label className="block text-sm">
              Remarque (facultatif)
              <textarea value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} rows={2} className="w-full border rounded px-3 py-2 mt-1" />
            </label>
            {openingError && <p className="text-sm text-red-600">{openingError}</p>}
            <div className="flex gap-2">
              <button disabled={openingBusy} className="flex-1 bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
                {openingBusy ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button type="button" onClick={() => setOpeningFor(null)} className="border rounded-lg px-4">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
