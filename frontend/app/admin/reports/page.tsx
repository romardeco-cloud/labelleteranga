"use client";

import MonthlyReports from "@/components/admin/MonthlyReports";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PointOfSale, ProductSalesRow, fetchPointsOfSale, fetchProductSales } from "@/lib/api";
import {
  DiscrepancyReport,
  Inventory,
  OpenDocs,
  Overview,
  downloadExport,
  openPdf,
  fetchDiscrepancies,
  fetchInventory,
  fetchOverview,
  fetchPayables,
  fetchReceivables,
  formatDate,
  formatXof,
} from "@/lib/documents";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function presets() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  return [
    { label: "Aujourd'hui", start: iso(now), end: iso(now) },
    { label: "7 jours", start: iso(weekStart), end: iso(now) },
    { label: "Ce mois", start: iso(monthStart), end: iso(now) },
    { label: "Mois precedent", start: iso(prevStart), end: iso(prevEnd) },
    { label: "Cette annee", start: `${now.getFullYear()}-01-01`, end: iso(now) },
  ];
}

const TABS = [
  ["synthese", "Synthese"],
  ["ventes", "Ventes"],
  ["encaissements", "Encaissements"],
  ["stock", "Stock"],
  ["creances", "Creances et dettes"],
  ["ecarts", "Ecarts de caisse"],
] as const;
type Tab = (typeof TABS)[number][0];

function Bars({ rows, valueKey = "revenue", labelKey = "label" }: { rows: any[]; valueKey?: string; labelKey?: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey])));
  if (rows.length === 0) return <p className="text-sm text-gray-400">Aucune donnee sur cette periode.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex justify-between text-sm">
            <span>{r[labelKey]}</span>
            <span className="text-gray-600">
              {formatXof(r[valueKey])}
              {r.orders_count !== undefined && ` · ${r.orders_count} vente(s)`}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand" style={{ width: `${(Number(r[valueKey]) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: "bad" | "ok" }) {
  return (
    <div className="border rounded-lg bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`text-xl font-bold ${tone === "bad" ? "text-red-600" : "text-brand-dark"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rounded-lg bg-white p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function AgingTable({ data, partyLabel, href }: { data: OpenDocs | null; partyLabel: string; href: string }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      <p className="text-lg font-bold">{formatXof(data.total_outstanding)} en attente</p>
      <div className="flex flex-wrap gap-2">
        {data.aging.map((a) => (
          <span key={a.bucket} className="text-xs border rounded px-2 py-1">
            {a.bucket} : <b>{formatXof(a.amount)}</b>
          </span>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th>Numero</th>
            <th>{partyLabel}</th>
            <th>Date</th>
            <th>Echeance</th>
            <th className="text-right">Total</th>
            <th className="text-right">Solde</th>
            <th className="text-right">Retard</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td>
                <Link className="text-brand underline" href={`${href}/${r.id}`}>
                  {r.number}
                </Link>
              </td>
              <td>{r.party}</td>
              <td>{formatDate(r.date)}</td>
              <td>{formatDate(r.due_date)}</td>
              <td className="text-right">{formatXof(r.total)}</td>
              <td className="text-right font-medium">{formatXof(r.balance)}</td>
              <td className={`text-right ${r.days_overdue > 0 ? "text-red-600" : ""}`}>{r.days_overdue > 0 ? `${r.days_overdue} j` : "-"}</td>
            </tr>
          ))}
          {data.rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-3 text-center text-gray-400">
                Rien en attente.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsPage() {
  const ps = presets();
  const [range, setRange] = useState({ start: ps[2].start, end: ps[2].end });
  const [storeId, setStoreId] = useState<number | null>(null);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [tab, setTab] = useState<Tab>("synthese");
  const [threshold, setThreshold] = useState(5);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [products, setProducts] = useState<ProductSalesRow[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [receivables, setReceivables] = useState<OpenDocs | null>(null);
  const [payables, setPayables] = useState<OpenDocs | null>(null);
  const [gaps, setGaps] = useState<DiscrepancyReport | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchPointsOfSale().then(setStores);
    fetchReceivables().then(setReceivables);
    fetchPayables().then(setPayables);
  }, []);

  useEffect(() => {
    fetchOverview(range.start, range.end, storeId).then(setOverview);
    fetchProductSales(range.start, range.end, storeId).then(setProducts);
    fetchDiscrepancies(range.start, range.end, storeId).then(setGaps);
  }, [range, storeId]);

  useEffect(() => {
    fetchInventory(threshold, storeId).then(setInventory);
  }, [threshold, storeId]);

  const input = "border rounded px-2 py-1 text-sm";
  const o = overview;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Rapports</h1>
        <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            openPdf("/reports/pdf/", { start: range.start, end: range.end, ...(storeId ? { point_of_sale: storeId } : {}) }).catch(() =>
              alert("PDF impossible.")
            )
          }
          className="border border-brand text-brand rounded px-4 py-2 text-sm"
        >
          Rapport PDF de la periode
        </button>
        <button
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadExport(range.start, range.end, storeId);
            } catch {
              alert("Export impossible.");
            } finally {
              setExporting(false);
            }
          }}
          className="bg-brand text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {exporting ? "Export..." : "Exporter tout en Excel"}
        </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border rounded-lg p-3">
        {ps.map((p) => (
          <button
            key={p.label}
            onClick={() => setRange({ start: p.start, end: p.end })}
            className={`text-xs px-2 py-1 rounded ${range.start === p.start && range.end === p.end ? "bg-brand text-white" : "bg-gray-100 hover:bg-gray-200"}`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-2">Du</span>
        <input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} className={input} />
        <span className="text-xs text-gray-500">au</span>
        <input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} className={input} />
        <select value={storeId ?? ""} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)} className={input}>
          <option value="">Tous les points de vente</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <MonthlyReports storeId={storeId} />

      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === key ? "border-brand text-brand font-medium" : "border-transparent text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "synthese" && o && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card title="Chiffre d'affaires (ventes)" value={formatXof(o.sales.revenue)} sub={`${o.sales.orders_count} vente(s) · ticket moyen ${formatXof(o.sales.average_ticket)}`} />
            <Card title="Factures emises" value={formatXof(o.invoices.invoiced_total)} sub={`${o.invoices.count} facture(s) · reste ${formatXof(o.invoices.outstanding)}`} />
            <Card title="Devis" value={formatXof(o.quotes.total)} sub={`${o.quotes.count} devis · conversion ${o.quotes.conversion_rate} %`} />
            <Card title="Achats fournisseurs" value={formatXof(o.purchases.ordered_total)} sub={`${o.purchases.count} bon(s) de commande`} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Encaissements par mode de paiement (ventes + paiements de factures)">
              <Bars rows={o.cash_in_by_method.map((m) => ({ label: m.label, revenue: m.amount }))} />
            </Panel>
            <Panel title="Ecarts de caisse">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Card title="Manques" value={formatXof(o.cash_discrepancies.shortage)} tone={o.cash_discrepancies.shortage < 0 ? "bad" : undefined} />
                <Card title="Surplus" value={formatXof(o.cash_discrepancies.surplus)} />
                <Card title="Net" value={formatXof(o.cash_discrepancies.net)} tone={o.cash_discrepancies.net < 0 ? "bad" : undefined} />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {o.cash_discrepancies.closings_count} fermeture(s), dont {o.cash_discrepancies.with_discrepancy} avec ecart.
              </p>
            </Panel>
          </div>
        </div>
      )}

      {tab === "ventes" && o && (
        <div className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Par mode de paiement">
              <Bars rows={o.sales.by_payment_method} />
            </Panel>
            <Panel title="Par canal">
              <Bars rows={o.sales.by_channel} />
            </Panel>
            <Panel title="Par point de vente">
              <Bars rows={o.sales.by_store} />
            </Panel>
            <Panel title="Par caissier">
              <Bars rows={o.sales.by_cashier} />
            </Panel>
          </div>
          <Panel title="Par jour">
            <Bars rows={o.sales.by_day.map((d) => ({ label: formatDate(d.day), revenue: d.revenue, orders_count: d.orders_count }))} />
          </Panel>
          <Panel title="Par produit">
            {products.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune vente sur cette periode.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th>Produit</th>
                    <th className="text-right">Quantite</th>
                    <th className="text-right">Ventes</th>
                    <th className="text-right">Chiffre d&apos;affaires</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.product_id} className="border-t">
                      <td>{p.product_name}</td>
                      <td className="text-right">{p.quantity_sold}</td>
                      <td className="text-right">{p.orders_count}</td>
                      <td className="text-right font-medium">{formatXof(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}

      {tab === "encaissements" && o && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Total encaisse, tous modes">
            <Bars rows={o.cash_in_by_method.map((m) => ({ label: m.label, revenue: m.amount }))} />
          </Panel>
          <Panel title="Paiements de factures recus sur la periode">
            <Bars rows={o.invoices.collected_in_period_by_method.map((m) => ({ label: m.label, revenue: m.amount }))} />
          </Panel>
          <Panel title="Paiements fournisseurs effectues sur la periode">
            <Bars rows={o.purchases.paid_in_period_by_method.map((m) => ({ label: m.label, revenue: m.amount }))} />
          </Panel>
          <Panel title="Ventes en caisse et en ligne, par mode">
            <Bars rows={o.sales.by_payment_method} />
          </Panel>
        </div>
      )}

      {tab === "stock" && inventory && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card title="Unites en stock" value={String(inventory.totals.units)} />
            <Card title="Valeur (prix de vente)" value={formatXof(inventory.totals.value)} sub={inventory.note} />
            {inventory.by_store.map((s) => (
              <Card key={s.store} title={s.store} value={formatXof(s.value)} sub={`${s.units} unites · ${s.references} references`} />
            ))}
          </div>
          <Panel title={`Stock faible (${threshold} unites ou moins)`}>
            <label className="text-xs text-gray-500 mb-2 block">
              Seuil :{" "}
              <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={`${input} w-20`} />
            </label>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th>Point de vente</th>
                  <th>Produit</th>
                  <th className="text-right">Quantite</th>
                </tr>
              </thead>
              <tbody>
                {inventory.low_stock.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td>{r.store}</td>
                    <td>{r.product}</td>
                    <td className={`text-right ${r.quantity === 0 ? "text-red-600 font-medium" : ""}`}>{r.quantity}</td>
                  </tr>
                ))}
                {inventory.low_stock.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-center text-gray-400">
                      Aucun produit sous le seuil.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
          <Panel title="Inventaire detaille">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th>Point de vente</th>
                  <th>Reference</th>
                  <th>Produit</th>
                  <th className="text-right">Qte</th>
                  <th className="text-right">Prix</th>
                  <th className="text-right">Valeur</th>
                </tr>
              </thead>
              <tbody>
                {inventory.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td>{r.store}</td>
                    <td>{r.sku}</td>
                    <td>{r.product}</td>
                    <td className="text-right">{r.quantity}</td>
                    <td className="text-right">{formatXof(r.unit_price)}</td>
                    <td className="text-right">{formatXof(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === "creances" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Creances clients (factures impayees)">
            <AgingTable data={receivables} partyLabel="Client" href="/admin/documents/invoices" />
          </Panel>
          <Panel title="Dettes fournisseurs (bons de commande non soldes)">
            <AgingTable data={payables} partyLabel="Fournisseur" href="/admin/documents/purchase-orders" />
          </Panel>
        </div>
      )}

      {tab === "ecarts" && gaps && (
        <Panel title="Fermetures de caisse et ecarts">
          <div className="flex gap-6 text-sm mb-3">
            <span>Manques : <b className="text-red-600">{formatXof(gaps.shortage)}</b></span>
            <span>Surplus : <b>{formatXof(gaps.surplus)}</b></span>
            <span>Net : <b>{formatXof(gaps.net)}</b></span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th>Date</th>
                <th>Point de vente</th>
                <th>Caissier</th>
                <th className="text-right">Attendu</th>
                <th className="text-right">Declare</th>
                <th className="text-right">Ecart</th>
                <th className="text-right">Ecart initial</th>
                <th className="text-right">Corrections</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {gaps.rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td>{formatDate(r.date)}</td>
                  <td>{r.store}</td>
                  <td>{r.cashier ?? "(admin)"}</td>
                  <td className="text-right">{formatXof(r.expected)}</td>
                  <td className="text-right">{formatXof(r.declared)}</td>
                  <td className={`text-right font-medium ${r.discrepancy < 0 ? "text-red-600" : r.discrepancy > 0 ? "text-blue-600" : "text-gray-400"}`}>{formatXof(r.discrepancy)}</td>
                  <td className="text-right">{r.initial_discrepancy === null ? "-" : formatXof(r.initial_discrepancy)}</td>
                  <td className="text-right">{r.cashier ? r.corrections : "-"}</td>
                  <td className="max-w-[200px] truncate" title={r.notes}>{r.notes || "-"}</td>
                </tr>
              ))}
              {gaps.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-3 text-center text-gray-400">
                    Aucune fermeture sur cette periode.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
