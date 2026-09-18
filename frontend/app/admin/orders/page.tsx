"use client";

import { useEffect, useState } from "react";
import { Order, api, markOrderPaid } from "@/lib/api";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

const statusLabel: Record<string, string> = {
  pending: "En attente",
  paid: "Payee",
  failed: "Echouee",
  cancelled: "Annulee",
};

const paymentLabel: Record<string, string> = {
  card: "Carte",
  wave: "Wave",
  orange_money: "Orange Money",
  cash: "Especes",
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busyRef, setBusyRef] = useState<string | null>(null);

  function reload() {
    api.get("/orders/", { params: { page_size: 100 } }).then((res) => setOrders(res.data.results ?? res.data));
  }

  useEffect(reload, []);

  async function handleMarkPaid(reference: string) {
    if (!confirm("Confirmer la reception du paiement especes pour cette commande ?")) return;
    setBusyRef(reference);
    try {
      const order = await markOrderPaid(reference);
      reload();
      // ouvre directement WhatsApp vers le client avec la confirmation pre-remplie
      if (order.customer_whatsapp_link) {
        window.open(order.customer_whatsapp_link, "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusyRef(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Commandes</h1>
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Reference</th>
            <th className="p-2">Client</th>
            <th className="p-2">Adresse</th>
            <th className="p-2">Paiement</th>
            <th className="p-2">Statut</th>
            <th className="p-2">Total</th>
            <th className="p-2">Date</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t align-top">
              <td className="p-2 font-mono text-xs">{o.reference.slice(0, 8)}</td>
              <td className="p-2">
                {o.customer_name}
                <div className="text-xs text-gray-400">{o.customer_email}</div>
                <div className="text-xs text-gray-400">{o.customer_phone}</div>
              </td>
              <td className="p-2 max-w-[200px]">
                <div className="truncate" title={o.delivery_address}>
                  {o.delivery_address}
                </div>
                {o.location_maps_url && (
                  <a href={o.location_maps_url} target="_blank" rel="noopener noreferrer" className="text-brand text-xs underline">
                    Voir sur la carte
                  </a>
                )}
              </td>
              <td className="p-2">{paymentLabel[o.payment_method] ?? o.payment_method}</td>
              <td className="p-2">{statusLabel[o.status] ?? o.status}</td>
              <td className="p-2">{formatXof(o.total_amount)}</td>
              <td className="p-2">{new Date(o.created_at).toLocaleString("fr-SN")}</td>
              <td className="p-2 space-y-1">
                {o.status === "pending" && o.payment_method === "cash" && (
                  <button
                    onClick={() => handleMarkPaid(o.reference)}
                    disabled={busyRef === o.reference}
                    className="block text-xs bg-brand text-white px-2 py-1 rounded disabled:opacity-50"
                  >
                    Marquer payee
                  </button>
                )}
                {o.status === "paid" && o.customer_whatsapp_link && (
                  <a
                    href={o.customer_whatsapp_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs bg-green-600 text-white px-2 py-1 rounded text-center"
                    title="Ouvre WhatsApp pour envoyer la confirmation au client"
                  >
                    Envoyer au client
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
