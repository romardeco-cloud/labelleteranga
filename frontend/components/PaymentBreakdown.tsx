"use client";

import { useEffect, useState } from "react";
import { PaymentBreakdownRow, fetchPaymentBreakdown } from "@/lib/api";

const METHOD_LABELS: Record<string, string> = {
  card: "Carte bancaire",
  wave: "Wave",
  orange_money: "Orange Money",
  cash: "Especes",
};

const METHOD_COLORS: Record<string, string> = {
  card: "bg-blue-500",
  wave: "bg-sky-400",
  orange_money: "bg-orange-500",
  cash: "bg-brand-accent",
};

const PERIODS: { value: "today" | "month" | "year"; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "month", label: "Ce mois-ci" },
  { value: "year", label: "Cette annee" },
];

function formatXof(value: number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

export default function PaymentBreakdown() {
  const [period, setPeriod] = useState<"today" | "month" | "year">("today");
  const [rows, setRows] = useState<PaymentBreakdownRow[]>([]);

  useEffect(() => {
    fetchPaymentBreakdown(period).then(setRows);
  }, [period]);

  const total = rows.reduce((sum, r) => sum + Number(r.revenue), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Repartition par moyen de paiement</h2>
        <div className="flex gap-1 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-2 py-1 rounded ${
                period === p.value ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune vente sur cette periode.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const pct = total > 0 ? (Number(row.revenue) / total) * 100 : 0;
            return (
              <div key={row.payment_method}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{METHOD_LABELS[row.payment_method] ?? row.payment_method}</span>
                  <span className="text-gray-500">
                    {formatXof(row.revenue)} · {row.orders_count} commande(s)
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${METHOD_COLORS[row.payment_method] ?? "bg-gray-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="text-right text-sm font-semibold text-brand-dark pt-1">Total : {formatXof(total)}</div>
        </div>
      )}
    </div>
  );
}
