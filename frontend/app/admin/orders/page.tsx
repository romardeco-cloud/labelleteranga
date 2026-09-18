"use client";

import { useEffect, useState } from "react";
import { Order, PointOfSale, api, fetchPointsOfSale, markOrderPaid, setOrderPointOfSale } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

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
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Order | null>(null);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);

  async function confirmVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voiding) return;
    setVoidBusy(true);
    setVoidError("");
    try {
      await api.post(`/orders/${voiding.reference}/void/`, { pin, reason });
      setVoiding(null);
      setPin("");
      setReason("");
      reload();
    } catch (err) {
      setVoidError(apiErrorMessage(err, "Annulation impossible."));
      setPin("");
    } finally {
      setVoidBusy(false);
    }
  }

  function reload() {
    api.get("/orders/", { params: { page_size: 100 } }).then((res) => setOrders(res.data.results ?? res.data));
  }

  useEffect(() => {
    reload();
    fetchPointsOfSale().then(setStores);
  }, []);

  async function handlePointOfSaleChange(reference: string, value: string) {
    await setOrderPointOfSale(reference, value ? Number(value) : null);
    reload();
  }

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
      <h1 className="text-2xl font-bold">Commandes et ventes</h1>
      <p className="text-sm text-gray-500 -mt-2">
        Seul l&apos;administrateur peut supprimer une vente validee, avec son code secret a 4 chiffres. La vente est annulee (motif et auteur
        conserves), retiree des rapports, et le stock est remis en rayon.
      </p>
      {voiding && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setVoiding(null)}>
          <form onSubmit={confirmVoid} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h2 className="font-bold text-lg">Supprimer la vente {voiding.reference.slice(0, 8).toUpperCase()}</h2>
            <p className="text-sm text-gray-500">
              {formatXof(voiding.total_amount)} · {paymentLabel[voiding.payment_method] ?? voiding.payment_method}
            </p>
            <label className="block text-sm">
              Motif
              <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. erreur de saisie" className="w-full border rounded px-3 py-2 mt-1" />
            </label>
            <label className="block text-sm">
              Code secret (4 chiffres)
              <input
                required
                autoFocus
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="w-full border rounded px-3 py-2 mt-1 tracking-[0.6em] text-center text-lg"
              />
            </label>
            {voidError && <p className="text-sm text-red-600">{voidError}</p>}
            <div className="flex gap-2">
              <button disabled={voidBusy || pin.length !== 4 || !reason.trim()} className="flex-1 bg-red-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-40">
                {voidBusy ? "Verification..." : "Supprimer la vente"}
              </button>
              <button type="button" onClick={() => setVoiding(null)} className="border rounded-lg px-4">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Reference</th>
            <th className="p-2">Client</th>
            <th className="p-2">Adresse</th>
            <th className="p-2">Point de vente</th>
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
              <td className="p-2">
                <select
                  value={o.point_of_sale ?? ""}
                  onChange={(e) => handlePointOfSaleChange(o.reference, e.target.value)}
                  className="border rounded px-1 py-0.5 text-xs"
                >
                  <option value="">En ligne</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">{paymentLabel[o.payment_method] ?? o.payment_method}</td>
              <td className="p-2">
                {statusLabel[o.status] ?? o.status}
                {o.status === "cancelled" && o.voided_at && (
                  <div className="text-xs text-gray-400">
                    par {(o as Order & { voided_by_username?: string }).voided_by_username ?? "admin"}
                    {(o as Order & { void_reason?: string }).void_reason ? ` : ${(o as Order & { void_reason?: string }).void_reason}` : ""}
                  </div>
                )}
              </td>
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
                {o.status !== "cancelled" && (
                  <button
                    onClick={() => {
                      setVoiding(o);
                      setPin("");
                      setReason("");
                      setVoidError("");
                    }}
                    className="block text-xs border border-red-300 text-red-600 px-2 py-1 rounded w-full"
                  >
                    Supprimer
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
