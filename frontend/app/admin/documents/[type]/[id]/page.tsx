"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import PayBadge from "@/components/documents/PayBadge";
import SealBlock, { useCompanyContact } from "@/components/SealBlock";
import SealOptionsBar from "@/components/SealOptionsBar";
import {
  DOC_CONFIG,
  DocType,
  DocumentData,
  PAYMENT_METHODS,
  apiErrorMessage,
  documentAction,
  formatDate,
  formatXof,
  getDocument,
  saveDocument,
  openPdf,
} from "@/lib/documents";

const today = () => new Date().toISOString().slice(0, 10);

export default function DocumentDetailPage() {
  const company = useCompanyContact();
  const { type: rawType, id } = useParams<{ type: string; id: string }>();
  const type = rawType as DocType;
  const cfg = DOC_CONFIG[type];
  const router = useRouter();

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ method: "cash", amount: "", date: today(), reference: "" });
  const [receive, setReceive] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    getDocument(type, id).then((d) => {
      setDoc(d);
      setPay((p) => ({ ...p, amount: d.balance && Number(d.balance) > 0 ? String(Number(d.balance)) : "", method: d.payment_method || p.method }));
    });
  }, [type, id]);

  useEffect(() => {
    if (cfg) load();
  }, [cfg, load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <p>Type de document inconnu.</p>;
  if (!doc) return <p>Chargement...</p>;

  const isInvoice = type === "invoices";
  const isPO = type === "purchase-orders";
  const isQuote = type === "quotes";
  const partyName = doc.customer_name ?? doc.supplier_name;
  const cancelled = doc.status === "cancelled";
  const canPay = (isInvoice || isPO) && !cancelled && Number(doc.balance) > 0;
  const date2 = isQuote ? doc.valid_until : isInvoice ? doc.due_date : doc.expected_date;
  const btn = "border rounded px-3 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/admin/documents/${type}`} className="text-sm text-brand underline">
          ← {cfg.label}
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openPdf(`/documents/${type}/${doc.id}/pdf/`).catch(() => alert("PDF impossible."))}
            className="bg-brand text-white rounded px-3 py-1.5 text-sm"
          >
            PDF
          </button>
          <button onClick={() => window.print()} className={btn}>
            Imprimer
          </button>
          {!cancelled && (
            <Link href={`/admin/documents/${type}/${doc.id}/edit`} className={btn}>
              Modifier
            </Link>
          )}
          {isQuote && !doc.invoice_id && doc.status !== "rejected" && (
            <button
              disabled={busy}
              className="bg-brand text-white rounded px-3 py-1.5 text-sm"
              onClick={() => {
                if (!confirm("Transformer ce devis en facture ?")) return;
                run(async () => {
                  const inv = await documentAction("quotes", doc.id, "convert-to-invoice");
                  router.push(`/admin/documents/invoices/${inv.id}`);
                });
              }}
            >
              Transformer en facture
            </button>
          )}
          {isQuote && doc.invoice_id && (
            <Link href={`/admin/documents/invoices/${doc.invoice_id}`} className={btn}>
              Voir la facture {doc.invoice_number}
            </Link>
          )}
          {isQuote && !doc.invoice_id && (
            <>
              {doc.status === "draft" && (
                <button className={btn} onClick={() => run(() => saveDocument(type, { status: "sent" }, doc.id))}>
                  Marquer envoye
                </button>
              )}
              {doc.status !== "rejected" && (
                <button className={btn} onClick={() => run(() => saveDocument(type, { status: "rejected" }, doc.id))}>
                  Marquer refuse
                </button>
              )}
              {doc.status !== "accepted" && doc.status !== "rejected" && (
                <button className={btn} onClick={() => run(() => saveDocument(type, { status: "accepted" }, doc.id))}>
                  Marquer accepte
                </button>
              )}
            </>
          )}
          {isPO && doc.status === "draft" && (
            <button className={btn} onClick={() => run(() => saveDocument(type, { status: "sent" }, doc.id))}>
              Marquer envoye
            </button>
          )}
          {(isInvoice || isPO) && !cancelled && (
            <button
              className="border border-red-300 text-red-600 rounded px-3 py-1.5 text-sm"
              onClick={() => {
                if (confirm(`Annuler ${doc.number} ?`)) run(() => documentAction(type, doc.id, "cancel"));
              }}
            >
              Annuler
            </button>
          )}
        </div>
      </div>

      <SealOptionsBar />

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2 print:hidden">{error}</p>}

      {/* ---------- Document imprimable ---------- */}
      <div id="document" className="bg-white border rounded-lg p-6 print:border-0 print:p-0 print:shadow-none">
        <div className="flex justify-between items-start border-b pb-4 mb-4">
          <div className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="La Belle Teranga" width={64} height={64} className="rounded-full" />
            <div className="text-sm">
              <p className="font-bold text-lg">La Belle Teranga</p>
              {doc.point_of_sale_name && <p>{doc.point_of_sale_name}</p>}
              {company?.contact_address && <p>{company.contact_address}</p>}
              <p>
                {[company?.contact_phone ? `Tel : ${company.contact_phone}` : process.env.NEXT_PUBLIC_PHONE ? `Tel : ${process.env.NEXT_PUBLIC_PHONE}` : "", company?.contact_whatsapp && `WhatsApp : ${company.contact_whatsapp}`, company?.contact_email || "info@labelleteranga.com", company?.contact_website].filter(Boolean).join(" - ")}
              </p>
              {company?.legal_line && <p className="text-xs text-gray-600">{company.legal_line}</p>}
              {(company?.contact_extra ?? "").split("\n").filter((l) => l.trim()).map((l, i) => (
                <p key={i} className="text-xs text-gray-600">
                  {l}
                </p>
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold uppercase text-brand-dark">{cfg.singular}</p>
            <p className="font-mono">{doc.number}</p>
            <p className="text-sm text-gray-600">Date : {formatDate(doc.date)}</p>
            {date2 && (
              <p className="text-sm text-gray-600">
                {cfg.dateLabel2} : {formatDate(date2)}
              </p>
            )}
            <p className="mt-1 space-x-1 print:hidden">
              <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{doc.status_label}</span>
              {!isQuote && !cancelled && <PayBadge status={doc.payment_status} />}
              {doc.is_expired && <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">Expire</span>}
              {doc.is_overdue && <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">En retard</span>}
            </p>
          </div>
        </div>

        <div className="mb-4 text-sm">
          <p className="text-gray-500">{cfg.partyLabel}</p>
          <p className="font-semibold">{partyName}</p>
          {doc.source_quote_number && <p className="text-xs text-gray-500">Issue du devis {doc.source_quote_number}</p>}
        </div>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-1">Designation</th>
              <th className="py-1 text-right">Qte</th>
              <th className="py-1 text-right">Prix unit.</th>
              <th className="py-1 text-right">Remise</th>
              <th className="py-1 text-right">Montant</th>
              {isPO && <th className="py-1 text-right print:hidden">Recu</th>}
            </tr>
          </thead>
          <tbody>
            {doc.items.map((l, idx) => (
              <Fragment key={l.id}>
                {(idx === 0 || (l.category || "") !== (doc.items[idx - 1].category || "")) && (doc.items.some((x) => x.category) || false) && (
                  <tr className="bg-gray-100 print:bg-gray-100">
                    <td colSpan={isPO ? 6 : 5} className="py-1 px-1 font-semibold text-gray-700">
                      {l.category || "Autres articles"}
                    </td>
                  </tr>
                )}
              <tr className="border-b">
                <td className="py-1.5">{l.description}</td>
                <td className="py-1.5 text-right">{Number(l.quantity)}</td>
                <td className="py-1.5 text-right">{formatXof(l.unit_price)}</td>
                <td className="py-1.5 text-right">{Number(l.discount_percent) ? `${Number(l.discount_percent)} %` : "-"}</td>
                <td className="py-1.5 text-right">{formatXof(l.line_total)}</td>
                {isPO && (
                  <td className="py-1.5 text-right print:hidden">
                    {Number(l.received_quantity)} / {Number(l.quantity)}
                  </td>
                )}
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="text-sm w-64 space-y-1">
            <div className="flex justify-between">
              <span>Sous-total</span>
              <span>{formatXof(doc.subtotal)}</span>
            </div>
            {Number(doc.tax_rate) > 0 && (
              <div className="flex justify-between">
                <span>TVA ({Number(doc.tax_rate)} %)</span>
                <span>{formatXof(doc.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-1">
              <span>Total{Number(doc.tax_rate) > 0 ? " TTC" : ""}</span>
              <span>{formatXof(doc.total)}</span>
            </div>
            {(isInvoice || isPO) && !cancelled && (
              <>
                <div className="flex justify-between">
                  <span>Deja regle</span>
                  <span>{formatXof(doc.paid_amount)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Reste a payer</span>
                  <span>{formatXof(doc.balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 text-sm space-y-1">
          <p>
            <span className="text-gray-500">Mode de paiement :</span> {doc.payment_method_label || "Non precise"}
          </p>
          {doc.payment_terms && (
            <p>
              <span className="text-gray-500">Conditions :</span> {doc.payment_terms}
            </p>
          )}
          {doc.notes && <p className="whitespace-pre-line">{doc.notes}</p>}
        </div>

        {(doc.payments?.length ?? 0) > 0 && (
          <div className="mt-4">
            <p className="font-semibold text-sm mb-1">Paiements enregistres</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1">Date</th>
                  <th className="py-1">Mode</th>
                  <th className="py-1">Reference</th>
                  <th className="py-1 text-right">Montant</th>
                  <th className="py-1 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {doc.payments!.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-1">{formatDate(p.date)}</td>
                    <td className="py-1">{p.method_label}</td>
                    <td className="py-1">{p.reference || "-"}</td>
                    <td className="py-1 text-right">{formatXof(p.amount)}</td>
                    <td className="py-1 text-right print:hidden">
                      <button
                        className="text-xs text-red-500 underline"
                        onClick={() => {
                          if (confirm("Supprimer ce paiement ?")) run(() => documentAction(type, doc.id, "remove-payment", { payment_id: p.id }));
                        }}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <SealBlock />
      </div>

      {/* ---------- Actions (non imprimees) ---------- */}
      {canPay && (
        <form
          className="bg-white border rounded-lg p-4 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => documentAction(type, doc.id, "add-payment", { ...pay, amount: pay.amount }));
          }}
        >
          <h2 className="font-semibold mb-2">Enregistrer un paiement</h2>
          <div className="grid sm:grid-cols-5 gap-2">
            <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <input type="number" min="0" step="0.01" required placeholder="Montant" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input type="date" required value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Reference (n° transaction, cheque...)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <button disabled={busy} className="bg-brand text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {isPO && doc.status !== "cancelled" && doc.items.some((l) => Number(l.received_quantity) < Number(l.quantity)) && (
        <form
          className="bg-white border rounded-lg p-4 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            const items = Object.entries(receive)
              .filter(([, q]) => Number(q) > 0)
              .map(([lineId, quantity]) => ({ id: Number(lineId), quantity }));
            if (items.length === 0) return;
            run(async () => {
              await documentAction(type, doc.id, "receive", { items });
              setReceive({});
            });
          }}
        >
          <h2 className="font-semibold mb-1">Reception de marchandises</h2>
          <p className="text-xs text-gray-500 mb-2">
            Les quantites recues sont ajoutees au stock du point de vente destinataire{doc.point_of_sale_name ? ` (${doc.point_of_sale_name})` : ""}.
            {!doc.point_of_sale && " Choisissez d'abord un point de vente (bouton Modifier) pour les articles lies a un produit."}
          </p>
          <div className="space-y-1">
            {doc.items
              .filter((l) => Number(l.received_quantity) < Number(l.quantity))
              .map((l) => (
                <div key={l.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1">{l.description}</span>
                  <span className="text-gray-500">
                    reste {Number(l.quantity) - Number(l.received_quantity)} sur {Number(l.quantity)}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Qte recue"
                    value={receive[l.id!] ?? ""}
                    onChange={(e) => setReceive({ ...receive, [l.id!]: e.target.value })}
                    className="border rounded px-2 py-1 w-28"
                  />
                </div>
              ))}
          </div>
          <button disabled={busy} className="mt-3 bg-brand text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
            Valider la reception
          </button>
        </form>
      )}
    </div>
  );
}
