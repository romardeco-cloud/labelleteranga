"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Order = {
  id: number;
  reference: string;
  customer_name: string;
  customer_email: string;
  status: string;
  total_amount: string;
  created_at: string;
};

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

const statusLabel: Record<string, string> = {
  pending: "En attente",
  paid: "Payee",
  failed: "Echouee",
  cancelled: "Annulee",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    api.get("/orders/", { params: { page_size: 100 } }).then((res) => setOrders(res.data.results ?? res.data));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Commandes</h1>
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Reference</th>
            <th className="p-2">Client</th>
            <th className="p-2">Statut</th>
            <th className="p-2">Total</th>
            <th className="p-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t">
              <td className="p-2 font-mono text-xs">{o.reference}</td>
              <td className="p-2">
                {o.customer_name}
                <div className="text-xs text-gray-400">{o.customer_email}</div>
              </td>
              <td className="p-2">{statusLabel[o.status] ?? o.status}</td>
              <td className="p-2">{formatXof(o.total_amount)}</td>
              <td className="p-2">{new Date(o.created_at).toLocaleString("fr-SN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
