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

  async function resendWhatsApp(reference: string) {
    setBusyRef(reference);
    try {
      await api.post(`/payments/orders/${reference}/resend-whatsapp/`);
      reload();
    } finally {
      setBusyRef(null);
    }
  }
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

  const [changingPayment, setChangingPayment] = useState<Order | null>(null);
  const [newMethod, setNewMethod] = useState<string>("cash");
  const [payPin, setPayPin] = useState("");
  const [payReason, setPayReason] = useState("");
  const [payError, setPayError] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  async function confirmChangePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!changingPayment) return;
    setPayBusy(true);
    setPayError("");
    try {
      await api.post(`/orders/${changingPayment.reference}/change-payment/`, { payment_method: newMethod, pin: payPin, reason: payReason });
      setChangingPayment(null);
      setPayPin("");
      setPayReason("");
      reload();
    } catch (err) {
      setPayError(apiErrorMessage(err, "Correction impossible."));
      setPayPin("");
    } finally {
      setPayBusy(false);
    }
  }

  const [confirming, setConfirming] = useState<Order | null>(null);
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [rejectingRef, setRejectingRef] = useState<string | null>(null);

  async function confirmPending(e: React.FormEvent) {
    e.preventDefault();
    if (!confirming) return;
    setConfirmBusy(true);
    setConfirmError("");
    try {
      await api.post(`/orders/${confirming.reference}/confirm-correction/`, { pin: confirmPin });
      setConfirming(null);
      setConfirmPin("");
      reload();
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
      reload();
    } finally {
      setRejectingRef(null);
    }
  }

  const [filter, setFilter] = useState<"all" | "unfinished" | "paid" | "cancelled">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // charge jusqu'a 5 pages de 100 commandes
  async function reload() {
    const all: Order[] = [];
    let url: string | null = "/orders/";
    let params: Record<string, unknown> | undefined = { page_size: 100 };
    for (let i = 0; i < 5 && url; i++) {
      const res: { data: { results?: Order[]; next?: string | null } | Order[] } = await api.get(url, params ? { params } : undefined);
      const d = res.data;
      if (Array.isArray(d)) {
        all.push(...d);
        break;
      }
      all.push(...(d.results ?? []));
      url = d.next ? d.next : null;
      params = undefined;
    }
    setOrders(all);
    setSelected((cur) => new Set([...cur].filter((r) => all.some((o) => o.reference === r))));
  }

  // commande en ligne non finalisee : en attente ou echouee (jamais une vente payee ou annulee)
  const isUnfinished = (o: Order) => (o.status === "pending" || o.status === "failed") && (o as Order & { channel?: string }).channel !== "pos";
  const isDeclared = (o: Order) => o.status === "pending" && !!o.payment_declared_at;
  const shown = orders.filter((o) =>
    filter === "all" ? true : filter === "unfinished" ? isUnfinished(o) : filter === "paid" ? o.status === "paid" : o.status === "cancelled"
  );
  // "Tout selectionner" ne prend pas les commandes dont le client dit avoir paye (a verifier avant de supprimer)
  const selectable = shown.filter((o) => isUnfinished(o) && !isDeclared(o));
  const allSelected = selectable.length > 0 && selectable.every((o) => selected.has(o.reference));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((o) => o.reference)));
  const toggleOne = (ref: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  const selectedDeclared = orders.filter((o) => selected.has(o.reference) && isDeclared(o)).length;

  async function deleteSelected() {
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await api.post("/orders/bulk-delete/", { references: [...selected], include_declared: selectedDeclared > 0 });
      setBulkMsg({
        ok: true,
        text: `${res.data.deleted} commande(s) non finalisee(s) supprimee(s)${res.data.skipped ? ` ; ${res.data.skipped} conservee(s) (payees, annulees ou paiement declare).` : "."}`,
      });
      setSelected(new Set());
      setBulkConfirm(false);
      await reload();
    } catch (err) {
      setBulkMsg({ ok: false, text: apiErrorMessage(err, "Suppression impossible.") });
    } finally {
      setBulkBusy(false);
    }
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
    if (!confirm("Confirmer la reception du paiement pour cette commande ? Le client recevra sa confirmation WhatsApp.")) return;
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
      {confirming && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setConfirming(null)}>
          <form onSubmit={confirmPending} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
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
      {changingPayment && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setChangingPayment(null)}>
          <form onSubmit={confirmChangePayment} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h2 className="font-bold text-lg">Corriger le paiement {changingPayment.reference.slice(0, 8).toUpperCase()}</h2>
            <p className="text-sm text-gray-500">
              {formatXof(changingPayment.total_amount)} · actuellement {paymentLabel[changingPayment.payment_method] ?? changingPayment.payment_method}
            </p>
            <label className="block text-sm">
              Nouveau mode de paiement
              <select value={newMethod} onChange={(e) => setNewMethod(e.target.value)} className="w-full border rounded px-3 py-2 mt-1">
                {Object.entries(paymentLabel).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Motif
              <input required value={payReason} onChange={(e) => setPayReason(e.target.value)} placeholder="Ex. erreur de saisie a la caisse" className="w-full border rounded px-3 py-2 mt-1" />
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
                value={payPin}
                onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ""))}
                className="w-full border rounded px-3 py-2 mt-1 tracking-[0.6em] text-center text-lg"
              />
            </label>
            {payError && <p className="text-sm text-red-600">{payError}</p>}
            <div className="flex gap-2">
              <button
                disabled={payBusy || payPin.length !== 4 || !payReason.trim() || newMethod === changingPayment.payment_method}
                className="flex-1 bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
              >
                {payBusy ? "Verification..." : "Corriger le paiement"}
              </button>
              <button type="button" onClick={() => setChangingPayment(null)} className="border rounded-lg px-4">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
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
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", `Toutes (${orders.length})`],
            ["unfinished", `Non finalisees (${orders.filter(isUnfinished).length})`],
            ["paid", "Payees"],
            ["cancelled", "Annulees"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setFilter(key);
              setSelected(new Set());
            }}
            className={`px-3 py-1.5 rounded-full border text-sm ${filter === key ? "bg-brand text-white border-brand" : "text-gray-600 hover:border-brand"}`}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        {selectable.length > 0 && (
          <button onClick={toggleAll} className="border rounded-lg px-3 py-1.5 text-sm">
            {allSelected ? "Tout deselectionner" : `Tout selectionner (${selectable.length})`}
          </button>
        )}
        {selected.size > 0 && (
          <button onClick={() => setBulkConfirm(true)} className="bg-red-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium">
            Supprimer la selection ({selected.size})
          </button>
        )}
      </div>
      {bulkMsg && <p className={`text-sm ${bulkMsg.ok ? "text-green-600" : "text-red-600"}`}>{bulkMsg.text}</p>}
      {bulkConfirm && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setBulkConfirm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h2 className="font-bold text-lg">Supprimer {selected.size} commande(s) non finalisee(s) ?</h2>
            <p className="text-sm text-gray-600">
              Ces commandes en ligne n&apos;ont pas ete payees : elles sont supprimees definitivement. Les ventes payees ou annulees ne sont jamais touchees.
            </p>
            {selectedDeclared > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded p-2">
                Attention : {selectedDeclared} commande(s) selectionnee(s) ont un paiement declare par le client. Verifiez qu&apos;aucun paiement n&apos;a ete recu avant de continuer.
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={deleteSelected} disabled={bulkBusy} className="flex-1 bg-red-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
                {bulkBusy ? "Suppression..." : "Supprimer definitivement"}
              </button>
              <button onClick={() => setBulkConfirm(false)} className="border rounded-lg px-4">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2 w-8">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectable.length === 0} aria-label="Tout selectionner" />
            </th>
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
          {shown.length === 0 && (
            <tr>
              <td colSpan={10} className="p-8 text-center text-gray-500">
                Aucune commande.
              </td>
            </tr>
          )}
          {shown.map((o) => (
            <tr key={o.id} className={`border-t align-top ${selected.has(o.reference) ? "bg-red-50" : o.pending_action ? "bg-amber-50" : ""}`}>
              <td className="p-2">
                {isUnfinished(o) && (
                  <input
                    type="checkbox"
                    checked={selected.has(o.reference)}
                    onChange={() => toggleOne(o.reference)}
                    aria-label={`Selectionner ${o.reference.slice(0, 8)}`}
                    title={isDeclared(o) ? "Paiement declare par le client : a verifier avant suppression" : undefined}
                  />
                )}
              </td>
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
              <td className="p-2">
                {paymentLabel[o.payment_method] ?? o.payment_method}
                {o.payment_method_changed_at && (
                  <div className="text-xs text-gray-400" title={o.payment_method_change_reason}>
                    corrige par {o.payment_method_changed_by_username ?? "admin"}
                  </div>
                )}
              </td>
              <td className="p-2">
                {statusLabel[o.status] ?? o.status}
                {o.status === "pending" && o.payment_declared_at && (
                  <div className="text-xs text-amber-600">
                    Paiement declare - ref. <strong>{o.payment_reference}</strong> : a verifier
                  </div>
                )}
                {o.status === "pending" && !o.payment_declared_at && o.payment_method !== "cash" && o.payment_method !== "card" && (
                  <div className="text-xs text-gray-400">Le client n&apos;a pas encore valide son paiement</div>
                )}
                {o.status === "cancelled" && o.voided_at && (
                  <div className="text-xs text-gray-400">
                    par {(o as Order & { voided_by_username?: string }).voided_by_username ?? "admin"}
                    {(o as Order & { void_reason?: string }).void_reason ? ` : ${(o as Order & { void_reason?: string }).void_reason}` : ""}
                  </div>
                )}
                {o.pending_action && (
                  <div className="text-xs text-amber-700 font-medium mt-1">
                    En attente : {o.pending_action === "void" ? "annulation" : `paiement -> ${paymentLabel[o.pending_payment_method ?? ""] ?? o.pending_payment_method}`}
                    <div className="text-gray-500 font-normal">
                      demande par {o.pending_requested_by_username}
                      {o.pending_reason ? ` : ${o.pending_reason}` : ""}
                    </div>
                  </div>
                )}
              </td>
              <td className="p-2">{formatXof(o.total_amount)}</td>
              <td className="p-2">{new Date(o.created_at).toLocaleString("fr-SN")}</td>
              <td className="p-2 space-y-1">
                {o.pending_action && (
                  <>
                    <button
                      onClick={() => {
                        setConfirming(o);
                        setConfirmPin("");
                        setConfirmError("");
                      }}
                      className="block text-xs bg-amber-600 text-white px-2 py-1 rounded w-full"
                    >
                      Confirmer la demande
                    </button>
                    <button
                      onClick={() => rejectPending(o.reference)}
                      disabled={rejectingRef === o.reference}
                      className="block text-xs border border-gray-300 text-gray-600 px-2 py-1 rounded w-full disabled:opacity-50"
                    >
                      Rejeter
                    </button>
                  </>
                )}
                {o.status === "pending" && o.payment_method !== "card" && (
                  <button
                    onClick={() => handleMarkPaid(o.reference)}
                    disabled={busyRef === o.reference}
                    className="block text-xs bg-brand text-white px-2 py-1 rounded disabled:opacity-50"
                  >
                    Marquer payee
                  </button>
                )}
                {o.status === "paid" && !o.pending_action && (
                  <button
                    onClick={() => {
                      setChangingPayment(o);
                      setNewMethod(o.payment_method);
                      setPayPin("");
                      setPayReason("");
                      setPayError("");
                    }}
                    className="block text-xs border border-brand/40 text-brand px-2 py-1 rounded w-full"
                  >
                    Corriger paiement
                  </button>
                )}
                {o.status !== "cancelled" && !o.pending_action && (
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
                {o.status === "paid" && (
                  <div className="text-xs">
                    {(o as Order & { whatsapp_status?: string }).whatsapp_status === "sent" ? (
                      <span className="text-green-600">WhatsApp envoye</span>
                    ) : (
                      <>
                        <span className="text-amber-600" title={(o as Order & { whatsapp_error?: string }).whatsapp_error}>
                          WhatsApp non envoye
                        </span>
                        <button
                          onClick={() => resendWhatsApp(o.reference)}
                          disabled={busyRef === o.reference}
                          className="block underline text-brand disabled:opacity-50"
                        >
                          Renvoyer
                        </button>
                      </>
                    )}
                  </div>
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
