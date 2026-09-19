"use client";

import { Fragment, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Methods = { cash: number; wave: number; orange_money: number; card: number };
type Detail = { id: number; date: string; cashier: string | null; expected: Methods; declared: Methods; gap: Methods; gap_total: number; notes: string };
type StoreGap = {
  point_of_sale: number | null;
  name: string;
  closings: number;
  expected: Methods;
  declared: Methods;
  gap: Methods;
  gap_total: number;
  open_tills: string[];
  details: Detail[];
};
type Report = { start: string; end: string; stores: StoreGap[]; totals: Methods & { total: number } };

const COLS: { key: keyof Methods; label: string }[] = [
  { key: "cash", label: "Especes" },
  { key: "wave", label: "Wave" },
  { key: "orange_money", label: "Orange Money" },
  { key: "card", label: "Carte" },
];

const xof = (v: number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(v);
const plain = (v: number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(v);
const tone = (v: number) => (Math.abs(v) < 0.5 ? "text-gray-500" : v < 0 ? "text-red-400" : "text-amber-400");

function Gap({ v }: { v: number }) {
  return <span className={`font-medium ${tone(v)}`}>{Math.abs(v) < 0.5 ? "0" : `${xof(v)} FCFA`}</span>;
}

/** Ecart de caisse de chaque point de vente (declare - attendu), detaille par moyen de paiement. */
export default function StoreGaps({ date }: { date: string }) {
  const [start, setStart] = useState(date);
  const [end, setEnd] = useState(date);
  const [data, setData] = useState<Report | null>(null);
  const [open, setOpen] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    setStart(date);
    setEnd(date);
  }, [date]);

  useEffect(() => {
    api
      .get<Report>("/reports/closings/store-gaps/", { params: { start, end } })
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [start, end]);

  const preset = (days: number) => {
    const e = new Date(date + "T12:00:00");
    const s = new Date(e);
    s.setDate(s.getDate() - days + 1);
    setStart(s.toISOString().slice(0, 10));
    setEnd(date);
  };
  const monthStart = () => {
    setStart(date.slice(0, 8) + "01");
    setEnd(date);
  };

  return (
    <div className="border rounded-lg bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Ecarts de caisse par point de vente</h2>
          <p className="text-sm text-gray-500">Ecart = compte par le caissier moins attendu par le systeme. Rouge : manque ; orange : surplus.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={start} max={end} onChange={(e) => e.target.value && setStart(e.target.value)} className="border rounded px-2 py-1" />
          <span>au</span>
          <input type="date" value={end} min={start} onChange={(e) => e.target.value && setEnd(e.target.value)} className="border rounded px-2 py-1" />
          <button onClick={() => { setStart(date); setEnd(date); }} className="border rounded px-2 py-1">Jour</button>
          <button onClick={() => preset(7)} className="border rounded px-2 py-1">7 jours</button>
          <button onClick={monthStart} className="border rounded px-2 py-1">Mois</button>
        </div>
      </div>

      {!data ? (
        <p className="text-sm text-gray-500">Chargement...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="p-2">Point de vente</th>
                {COLS.map((c) => (
                  <th key={c.key} className="p-2 text-right">
                    {c.label}
                  </th>
                ))}
                <th className="p-2 text-right">Ecart total</th>
                <th className="p-2">Caisses</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.stores.map((s) => (
                <Fragment key={s.point_of_sale ?? "online"}>
                  <tr className="border-t">
                    <td className="p-2 font-medium">{s.name.replace(/ La Belle Teranga$/i, "")}</td>
                    {COLS.map((c) => (
                      <td key={c.key} className="p-2 text-right">
                        {s.closings ? <Gap v={s.gap[c.key]} /> : <span className="text-gray-400">-</span>}
                      </td>
                    ))}
                    <td className="p-2 text-right">{s.closings ? <Gap v={s.gap_total} /> : <span className="text-gray-400">-</span>}</td>
                    <td className="p-2 text-xs text-gray-500">
                      {s.closings} fermee(s)
                      {s.open_tills.length > 0 && <span className="block text-amber-500">Ouverte : {s.open_tills.join(", ")}</span>}
                    </td>
                    <td className="p-2 text-right">
                      {s.details.length > 0 && (
                        <button onClick={() => setOpen(open === s.point_of_sale ? undefined : s.point_of_sale)} className="text-xs underline text-brand">
                          {open === s.point_of_sale ? "Masquer" : "Detail"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === s.point_of_sale && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <table className="w-full text-xs bg-gray-50/60">
                          <thead className="text-gray-500 text-left">
                            <tr>
                              <th className="p-2">Jour / caissier</th>
                              {COLS.map((c) => (
                                <th key={c.key} className="p-2 text-right">
                                  {c.label} (attendu / compte / ecart)
                                </th>
                              ))}
                              <th className="p-2 text-right">Ecart</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.details.map((d) => (
                              <tr key={d.id} className="border-t">
                                <td className="p-2">
                                  {new Date(d.date + "T12:00:00").toLocaleDateString("fr-FR")} - {d.cashier ?? "Cloture globale"}
                                  {d.notes && <span className="block text-gray-500 italic">{d.notes}</span>}
                                </td>
                                {COLS.map((c) => (
                                  <td key={c.key} className="p-2 text-right whitespace-nowrap">
                                    {plain(d.expected[c.key])} / {plain(d.declared[c.key])} / <Gap v={d.gap[c.key]} />
                                  </td>
                                ))}
                                <td className="p-2 text-right">
                                  <Gap v={d.gap_total} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="p-2">Total</td>
                {COLS.map((c) => (
                  <td key={c.key} className="p-2 text-right">
                    <Gap v={data.totals[c.key]} />
                  </td>
                ))}
                <td className="p-2 text-right">
                  <Gap v={data.totals.total} />
                </td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
