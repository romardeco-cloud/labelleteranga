"use client";

import { useEffect, useState } from "react";
import { PointOfSale, ProductSalesRow, fetchPointsOfSale, fetchProductSales } from "@/lib/api";

function formatXof(value: number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function monthBounds(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = `${monthValue}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${monthValue}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function ProductSalesReport() {
  const [month, setMonth] = useState(currentMonthValue());
  const [storeId, setStoreId] = useState<number | null>(null);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [rows, setRows] = useState<ProductSalesRow[]>([]);

  useEffect(() => {
    fetchPointsOfSale().then(setStores);
  }, []);

  useEffect(() => {
    const { start, end } = monthBounds(month);
    fetchProductSales(start, end, storeId).then(setRows);
  }, [month, storeId]);

  const total = rows.reduce((sum, r) => sum + Number(r.revenue), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold">Ventes par produit</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {stores.length > 0 && (
            <select
              value={storeId ?? ""}
              onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)}
              className="border rounded px-2 py-1"
            >
              <option value="">Tous les points de vente</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune vente sur cette periode.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="pb-2">Produit</th>
              <th className="pb-2">Quantite vendue</th>
              <th className="pb-2">Commandes</th>
              <th className="pb-2">Chiffre d&apos;affaires</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.product_id} className="border-t">
                <td className="py-1.5">{row.product_name}</td>
                <td className="py-1.5">{row.quantity_sold}</td>
                <td className="py-1.5">{row.orders_count}</td>
                <td className="py-1.5 font-medium">{formatXof(row.revenue)}</td>
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5"></td>
              <td className="py-1.5"></td>
              <td className="py-1.5">{formatXof(total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
