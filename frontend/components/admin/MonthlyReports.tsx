"use client";

import { useState } from "react";
import { downloadExport, openPdf } from "@/lib/documents";

const MONTHS = ["Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin", "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Rapports mensuels (PDF avec totaux de ventes du mois et cumul de l'annee) : un clic en fin de mois. */
export default function MonthlyReports({ storeId, months = 12, compact = false }: { storeId: number | null; months?: number; compact?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const [custom, setCustom] = useState({ start: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, end: todayIso });
  const rows = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const last = new Date(y, m, 0).getDate();
    return { key: `${y}-${pad(m)}`, y, m, label: `${MONTHS[m - 1]} ${y}`, start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}`, current: i === 0 };
  });

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    try {
      await fn();
    } catch {
      alert("Le rapport n'a pas pu etre genere.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="border rounded-lg bg-white p-4">
      <h2 className="font-semibold">Rapports mensuels</h2>
      <p className="text-sm text-gray-500 mb-3">
        A la fin de chaque mois, ouvrez le rapport en PDF : totaux de ventes du mois, encaissements, depenses, ecarts de caisse et totaux mensuels de
        l&apos;annee.
      </p>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.key} className="py-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              {r.label}
              {r.current && <span className="ml-2 text-xs text-gray-400">(en cours)</span>}
              {!r.current && r.key === rows[1]?.key && <span className="ml-2 text-xs bg-emerald-500/15 text-emerald-500 px-1.5 py-0.5 rounded">a jour</span>}
            </span>
            <span className="flex gap-2">
              <button
                disabled={busy === `p${r.key}`}
                onClick={() => run(`p${r.key}`, () => openPdf("/reports/pdf/", { month: r.key, ...(storeId ? { point_of_sale: storeId } : {}) }))}
                className="text-xs bg-brand text-white rounded px-3 py-1.5 disabled:opacity-50"
              >
                {busy === `p${r.key}` ? "..." : "PDF"}
              </button>
              {!compact && (
                <button
                  disabled={busy === `x${r.key}`}
                  onClick={() => run(`x${r.key}`, () => downloadExport(r.start, r.end, storeId))}
                  className="text-xs border rounded px-3 py-1.5 disabled:opacity-50"
                >
                  Excel
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!compact && (
        <div className="mt-3 flex gap-2">
          {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
            <button
              key={y}
              onClick={() => run(`y${y}`, () => openPdf("/reports/pdf/", { year: y, ...(storeId ? { point_of_sale: storeId } : {}) }))}
              className="text-xs border rounded px-3 py-1.5"
            >
              Rapport annuel {y} (PDF)
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Periode personnalisee :</span>
        <span className="text-xs text-gray-500">Du</span>
        <input
          type="date"
          value={custom.start}
          max={custom.end}
          onChange={(e) => setCustom({ ...custom, start: e.target.value })}
          className="border rounded px-2 py-1 text-sm"
        />
        <span className="text-xs text-gray-500">au</span>
        <input
          type="date"
          value={custom.end}
          min={custom.start}
          max={todayIso}
          onChange={(e) => setCustom({ ...custom, end: e.target.value })}
          className="border rounded px-2 py-1 text-sm"
        />
        <button
          disabled={busy === "custom-pdf"}
          onClick={() =>
            run("custom-pdf", () => openPdf("/reports/pdf/", { start: custom.start, end: custom.end, ...(storeId ? { point_of_sale: storeId } : {}) }))
          }
          className="text-xs bg-brand text-white rounded px-3 py-1.5 disabled:opacity-50"
        >
          {busy === "custom-pdf" ? "..." : "PDF"}
        </button>
        {!compact && (
          <button
            disabled={busy === "custom-xlsx"}
            onClick={() => run("custom-xlsx", () => downloadExport(custom.start, custom.end, storeId))}
            className="text-xs border rounded px-3 py-1.5 disabled:opacity-50"
          >
            {busy === "custom-xlsx" ? "..." : "Excel"}
          </button>
        )}
      </div>
    </section>
  );
}
