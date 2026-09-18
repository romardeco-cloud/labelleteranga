"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PointOfSale, fetchPointsOfSale } from "@/lib/api";
import PayBadge from "@/components/documents/PayBadge";
import { DOC_CONFIG, DocType, DocumentData, formatDate, formatXof, listDocuments } from "@/lib/documents";

const STATUSES: Record<DocType, { value: string; label: string }[]> = {
  quotes: [
    { value: "draft", label: "Brouillon" },
    { value: "sent", label: "Envoye" },
    { value: "accepted", label: "Accepte" },
    { value: "rejected", label: "Refuse" },
  ],
  invoices: [
    { value: "issued", label: "Emise" },
    { value: "cancelled", label: "Annulee" },
  ],
  "purchase-orders": [
    { value: "draft", label: "Brouillon" },
    { value: "sent", label: "Envoye" },
    { value: "partial", label: "Partiellement recu" },
    { value: "received", label: "Recu" },
    { value: "cancelled", label: "Annule" },
  ],
};

export default function DocumentListPage() {
  const params = useParams<{ type: string }>();
  const type = params.type as DocType;
  const cfg = DOC_CONFIG[type];

  const [docs, setDocs] = useState<DocumentData[]>([]);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [filters, setFilters] = useState({ search: "", status: "", payment_status: "", start: "", end: "", point_of_sale: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPointsOfSale().then(setStores);
  }, []);

  useEffect(() => {
    if (!cfg) return;
    setLoading(true);
    const q: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => v && (q[k] = v));
    const t = setTimeout(() => listDocuments(type, q).then(setDocs).finally(() => setLoading(false)), 250);
    return () => clearTimeout(t);
  }, [type, cfg, filters]);

  const total = useMemo(() => docs.reduce((s, d) => s + Number(d.total), 0), [docs]);
  const balance = useMemo(() => docs.reduce((s, d) => s + Number(d.balance ?? 0), 0), [docs]);

  if (!cfg) return <p>Type de document inconnu.</p>;
  const partyName = (d: DocumentData) => d.customer_name ?? d.supplier_name;
  const input = "border rounded px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{cfg.label}</h1>
        <Link href={`/admin/documents/${type}/new`} className="bg-brand text-white rounded px-4 py-2 text-sm">
          + {cfg.fem ? "Nouvelle" : "Nouveau"} {cfg.singular.toLowerCase()}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 bg-white border rounded-lg p-3">
        <input placeholder="Numero ou nom..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className={input} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={input}>
          <option value="">Tous les statuts</option>
          {STATUSES[type].map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {type !== "quotes" && (
          <select value={filters.payment_status} onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })} className={input}>
            <option value="">Tous paiements</option>
            <option value="unpaid">Impayees</option>
            <option value="partial">Partielles</option>
            <option value="paid">Payees</option>
          </select>
        )}
        <select value={filters.point_of_sale} onChange={(e) => setFilters({ ...filters, point_of_sale: e.target.value })} className={input}>
          <option value="">Tous points de vente</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="text-xs text-gray-500 flex items-center gap-1">
          Du <input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} className={input} />
        </label>
        <label className="text-xs text-gray-500 flex items-center gap-1">
          au <input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} className={input} />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Numero</th>
              <th className="p-2">Date</th>
              <th className="p-2">{cfg.partyLabel}</th>
              <th className="p-2">Mode de paiement</th>
              <th className="p-2">Statut</th>
              <th className="p-2 text-right">Total</th>
              {type !== "quotes" && <th className="p-2 text-right">Solde</th>}
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t hover:bg-brand-light/40">
                <td className="p-2 font-medium">
                  <Link href={`/admin/documents/${type}/${d.id}`} className="text-brand underline">
                    {d.number}
                  </Link>
                </td>
                <td className="p-2">{formatDate(d.date)}</td>
                <td className="p-2">{partyName(d)}</td>
                <td className="p-2">{d.payment_method_label || "-"}</td>
                <td className="p-2 space-x-1">
                  <span className="text-xs bg-gray-100 rounded px-2 py-0.5">{d.status_label}</span>
                  {d.is_expired && <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">Expire</span>}
                  {type !== "quotes" && d.status !== "cancelled" && <PayBadge status={d.payment_status} />}
                  {d.is_overdue && <span className="text-xs bg-red-100 text-red-700 rounded px-2 py-0.5">En retard</span>}
                </td>
                <td className="p-2 text-right">{formatXof(d.total)}</td>
                {type !== "quotes" && <td className="p-2 text-right">{d.status === "cancelled" ? "-" : formatXof(d.balance)}</td>}
              </tr>
            ))}
            {!loading && docs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400">
                  Aucun document.
                </td>
              </tr>
            )}
          </tbody>
          {docs.length > 0 && (
            <tfoot>
              <tr className="border-t font-semibold bg-gray-50">
                <td className="p-2" colSpan={5}>
                  {docs.length} document(s)
                </td>
                <td className="p-2 text-right">{formatXof(total)}</td>
                {type !== "quotes" && <td className="p-2 text-right">{formatXof(balance)}</td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
