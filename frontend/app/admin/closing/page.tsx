"use client";

import { useEffect, useState } from "react";
import CashierTills from "@/components/admin/CashierTills";
import { openPdf } from "@/lib/documents";
import {
  ClosingPreview,
  DailyClosing,
  PointOfSale,
  fetchClosingPreview,
  deleteClosing,
  fetchClosings,
  fetchPointsOfSale,
  saveClosing,
} from "@/lib/api";

const METHODS: { key: "card" | "wave" | "orange_money" | "cash"; label: string }[] = [
  { key: "card", label: "Carte bancaire" },
  { key: "wave", label: "Wave" },
  { key: "orange_money", label: "Orange Money" },
  { key: "cash", label: "Especes" },
];

function formatXof(value: number | string) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminClosingPage() {
  const [date, setDate] = useState(todayIso());
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [preview, setPreview] = useState<ClosingPreview | null>(null);
  const [declared, setDeclared] = useState({ card: 0, wave: 0, orange_money: 0, cash: 0 });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<DailyClosing[]>([]);

  useEffect(() => {
    fetchPointsOfSale().then(setStores);
  }, []);

  function loadHistory() {
    fetchClosings(storeId).then(setHistory);
  }

  useEffect(loadHistory, [storeId]);

  useEffect(() => {
    fetchClosingPreview(date, storeId).then((data) => {
      setPreview(data);
      if (data.closing) {
        setDeclared({
          card: Number(data.closing.declared_card),
          wave: Number(data.closing.declared_wave),
          orange_money: Number(data.closing.declared_orange_money),
          cash: Number(data.closing.declared_cash),
        });
        setNotes(data.closing.notes);
      } else {
        // pre-remplit avec les montants attendus : l'admin n'ajuste que les ecarts constates
        setDeclared({ ...data.expected });
        setNotes("");
      }
    });
  }, [date, storeId]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveClosing(
        {
          date,
          point_of_sale: storeId,
          declared_card: declared.card,
          declared_wave: declared.wave,
          declared_orange_money: declared.orange_money,
          declared_cash: declared.cash,
          notes,
        },
        preview?.closing?.id ?? null
      );
      const refreshed = await fetchClosingPreview(date, storeId);
      setPreview(refreshed);
      loadHistory();
    } finally {
      setSaving(false);
    }
  }

  const expected = preview?.expected ?? { card: 0, wave: 0, orange_money: 0, cash: 0 };
  const declaredTotal = declared.card + declared.wave + declared.orange_money + declared.cash;
  const expectedTotal = expected.card + expected.wave + expected.orange_money + expected.cash;
  const gapTotal = declaredTotal - expectedTotal;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Cloture de caisse</h1>

      <div className="flex flex-wrap items-center gap-3 -mb-4">
        <label className="text-sm font-medium">Journee du</label>
        <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1" />
        <label className="text-sm font-medium ml-2">Point de vente</label>
        <select value={storeId ?? ""} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)} className="border rounded px-2 py-1">
          <option value="">Tous / en ligne</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <CashierTills date={date} storeId={storeId} onChanged={loadHistory} />

      <div className="border rounded-lg bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">Journee du</label>
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <label className="text-sm font-medium ml-2">Point de vente</label>
          <select
            value={storeId ?? ""}
            onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)}
            className="border rounded px-2 py-1"
          >
            <option value="">En ligne (non affecte)</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {preview?.already_closed && (
            <span className="text-xs bg-brand-light text-brand-dark px-2 py-1 rounded">
              Deja cloturee {preview.closing?.closed_by_username ? `par ${preview.closing.closed_by_username}` : ""}
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pb-2">Moyen de paiement</th>
              <th className="pb-2">Attendu (systeme)</th>
              <th className="pb-2">Compte / declare</th>
              <th className="pb-2">Ecart</th>
            </tr>
          </thead>
          <tbody>
            {METHODS.map((m) => {
              const gap = declared[m.key] - expected[m.key];
              return (
                <tr key={m.key} className="border-t">
                  <td className="py-2">{m.label}</td>
                  <td className="py-2 text-gray-600">{formatXof(expected[m.key])}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      value={declared[m.key]}
                      onChange={(e) => setDeclared({ ...declared, [m.key]: Number(e.target.value) })}
                      className="w-28 border rounded px-2 py-1"
                    />
                  </td>
                  <td className={`py-2 font-medium ${gap === 0 ? "text-gray-400" : gap > 0 ? "text-blue-600" : "text-red-600"}`}>
                    {gap > 0 ? "+" : ""}
                    {formatXof(gap)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t font-semibold">
              <td className="py-2">Total</td>
              <td className="py-2">{formatXof(expectedTotal)}</td>
              <td className="py-2">{formatXof(declaredTotal)}</td>
              <td className={`py-2 ${gapTotal === 0 ? "text-gray-400" : gapTotal > 0 ? "text-blue-600" : "text-red-600"}`}>
                {gapTotal > 0 ? "+" : ""}
                {formatXof(gapTotal)}
              </td>
            </tr>
          </tbody>
        </table>

        <div>
          <label className="block text-sm font-medium mb-1">Notes (raison d&apos;un ecart, etc.)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-dark transition disabled:opacity-50"
        >
          {saving ? "Enregistrement..." : preview?.already_closed ? "Mettre a jour la cloture" : "Cloturer la journee"}
        </button>
      </div>

      <div>
        <h2 className="font-semibold mb-2">
          Historique des clotures {storeId ? `- ${stores.find((s) => s.id === storeId)?.name}` : "- En ligne"}
        </h2>
        <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Date</th>
              <th className="p-2">Attendu</th>
              <th className="p-2">Declare</th>
              <th className="p-2">Ecart</th>
              <th className="p-2">Caissier</th>
              <th className="p-2">Corrections</th>
              <th className="p-2">Notes</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {history.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.date}</td>
                <td className="p-2">{formatXof(c.expected_total)}</td>
                <td className="p-2">{formatXof(c.declared_total)}</td>
                <td className={`p-2 font-medium ${Number(c.discrepancy_total) === 0 ? "text-gray-400" : Number(c.discrepancy_total) > 0 ? "text-blue-600" : "text-red-600"}`}>
                  {Number(c.discrepancy_total) > 0 ? "+" : ""}
                  {formatXof(c.discrepancy_total)}
                </td>
                <td className="p-2">
                  {c.cashier_username ?? (c.closed_by_username ? `${c.closed_by_username} (admin)` : "-")}
                </td>
                <td className="p-2 text-xs">
                  {c.cashier_username
                    ? c.revision_count > 0
                      ? `${c.revision_count} (ecart initial ${formatXof(c.initial_discrepancy_total)})`
                      : "0"
                    : "-"}
                </td>
                <td className="p-2 max-w-[220px] truncate" title={c.notes}>
                  {c.notes || "-"}
                </td>
                <td className="p-2 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => openPdf(`/reports/closings/${c.id}/pdf/`).catch(() => alert("PDF impossible."))} className="text-xs text-brand underline">
                    PDF
                  </button>
                  {c.cashier_username && (
                    <button
                      onClick={async () => {
                        if (
                          !confirm(
                            "Rouvrir la caisse de ce caissier ? Sa fermeture sera supprimee et il pourra vendre a nouveau aujourd'hui."
                          )
                        )
                          return;
                        await deleteClosing(c.id);
                        loadHistory();
                      }}
                      className="text-xs text-red-500 underline"
                    >
                      Rouvrir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
