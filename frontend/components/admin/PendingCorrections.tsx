"use client";

import { useEffect, useState } from "react";
import { Order, api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

const paymentLabel: Record<string, string> = {
  card: "Carte",
  wave: "Wave",
  orange_money: "Orange Money",
  cash: "Especes",
};

/** Demandes des caissiers (annulation / correction de paiement) en attente de confirmation par l'administrateur. */
export default function PendingCorrections() {
  const [items, setItems] = useState<Order[] | null>(null);
  const [confirming, setConfirming] = useState<Order | null>(null);
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [rejectingRef, setRejectingRef] = useState<string | null>(null);

  async function load() {
    const res = await api.get<Order[]>("/orders/pending-corrections/");
    setItems(res.data);
  }

  useEffect(() => {
    load().catch(() => setItems([]));
    const t = setInterval(() => load().catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);

  async function confirmPending(e: React.FormEvent) {
    e.preventDefault();
    if (!confirming) return;
    setConfirmBusy(true);
    setConfirmError("");
    try {
      await api.post(`/orders/${confirming.reference}/confirm-correction/`, { pin: confirmPin });
      setConfirming(null);
      setConfirmPin("");
      load();
    } catch (err) {
      setConfirmError(apiErrorMessage(err, "Confirmation impossible."));
      setConfirmPin("");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function rejectPending(reference: string) {
    if (!confirm("Rejeter cette demande du caissier ? La vente ne sera pas modifiee.")) return;
    setRejectingRef(reference);
    try {
      await api.post(`/orders/${reference}/reject-correction/`);
      load();
    } finally {
      setRejectingRef(null);
    }
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="border border-amber-500/30 bg-amber-500/10 rounded-xl p-5 print:hidden">
      <h2 className="font-semibold flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block animate-pulse" />
        {items.length} demande{items.length > 1 ? "s" : ""} de caissier en attente
      </h2>
      <p className="text-sm text-gray-500 mb-4">Annulation ou correction de paiement : sans effet tant que vous ne confirmez pas avec votre code.</p>
      <div className="space-y-2">
        {items.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 bg-[#1c1514] border rounded-lg p-3">
            <div>
              <p className="font-medium text-sm">
                {formatXof(o.total_amount)} · {o.point_of_sale_name ?? "—"} ·{" "}
                {o.pending_action === "void" ? "annulation" : `paiement -> ${paymentLabel[o.pending_payment_method ?? ""] ?? o.pending_payment_method}`}
              </p>
              <p className="text-xs text-gray-500">
                demande par <strong>{o.pending_requested_by_username}</strong>
                {o.pending_reason ? ` : ${o.pending_reason}` : ""}
                {o.pending_requested_at && ` · ${new Date(o.pending_requested_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  setConfirming(o);
                  setConfirmPin("");
                  setConfirmError("");
                }}
                className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded"
              >
                Confirmer
              </button>
              <button
                onClick={() => rejectPending(o.reference)}
                disabled={rejectingRef === o.reference}
                className="text-xs border border-gray-500/40 text-gray-300 px-3 py-1.5 rounded disabled:opacity-50"
              >
                Rejeter
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirming(null)}>
          <form onSubmit={confirmPending} onClick={(e) => e.stopPropagation()} className="bg-white text-black rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h2 className="font-bold text-lg">Confirmer la demande {confirming.reference.slice(0, 8).toUpperCase()}</h2>
            <p className="text-sm text-gray-600">
              {confirming.pending_action === "void"
                ? "Annulation demandee"
                : `Correction demandee vers ${paymentLabel[confirming.pending_payment_method ?? ""] ?? confirming.pending_payment_method}`}{" "}
              par <strong>{confirming.pending_requested_by_username}</strong>
              {confirming.pending_reason ? ` : ${confirming.pending_reason}` : ""}
            </p>
            <label className="block text-sm">
              Votre code secret administrateur (4 chiffres)
              <input
                required
                autoFocus
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                className="w-full border rounded px-3 py-2 mt-1 tracking-[0.6em] text-center text-lg"
              />
            </label>
            {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
            <div className="flex gap-2">
              <button disabled={confirmBusy || confirmPin.length !== 4} className="flex-1 bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-40">
                {confirmBusy ? "Verification..." : "Confirmer et appliquer"}
              </button>
              <button type="button" onClick={() => setConfirming(null)} className="border rounded-lg px-4">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
