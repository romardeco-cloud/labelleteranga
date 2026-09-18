"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DiscrepancyReport,
  OpenDocs,
  Overview,
  fetchDiscrepancies,
  fetchOverview,
  fetchPayables,
  fetchReceivables,
  formatXof,
} from "@/lib/documents";

const pad = (n: number) => String(n).padStart(2, "0");

function monthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}`, label: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase()) };
}

const SHORTCUTS = [
  { href: "/admin/documents/invoices/new", title: "Nouvelle facture", text: "Facturer un client, encaisser par Wave, Orange Money, especes..." },
  { href: "/admin/documents/quotes/new", title: "Nouveau devis", text: "Etablir une offre de prix, a transformer en facture." },
  { href: "/admin/documents/purchase-orders/new", title: "Nouveau bon de commande", text: "Commander aupres d'un fournisseur et suivre la reception." },
  { href: "/admin/closing", title: "Clotures de caisse", text: "Totaux par mode de paiement et ecarts par point de vente." },
  { href: "/admin/contacts", title: "Clients / Fournisseurs", text: "Repertoire utilise dans tous vos documents." },
  { href: "/admin/reports", title: "Rapports", text: "Ventes, encaissements, stock, creances, dettes, export Excel." },
];

export default function AccountingHome() {
  const range = monthRange();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [receivables, setReceivables] = useState<OpenDocs | null>(null);
  const [payables, setPayables] = useState<OpenDocs | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyReport | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchOverview(range.start, range.end),
      fetchReceivables(),
      fetchPayables(),
      fetchDiscrepancies(range.start, range.end),
    ])
      .then(([o, r, p, d]) => {
        setOverview(o);
        setReceivables(r);
        setPayables(p);
        setDiscrepancies(d);
      })
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overdueReceivable = receivables?.rows.filter((r) => r.days_overdue > 0) ?? [];
  const overdueAmount = overdueReceivable.reduce((sum, r) => sum + r.balance, 0);
  const openQuotes = (overview?.quotes.by_status.sent ?? 0) + (overview?.quotes.by_status.draft ?? 0);
  const net = discrepancies?.net ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Comptabilite</h1>
        <p className="text-sm text-gray-500">Vue d&apos;ensemble &middot; {range.label}</p>
      </div>

      {error && <p className="text-sm bg-red-50 text-red-700 p-3 rounded">Impossible de charger les indicateurs.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Ventes du mois" value={overview ? formatXof(overview.sales.revenue) : "..."} sub={overview ? `${overview.sales.orders_count} ventes` : ""} />
        <Kpi
          label="Factures du mois"
          value={overview ? formatXof(overview.invoices.invoiced_total) : "..."}
          sub={overview ? `${overview.invoices.count} factures` : ""}
        />
        <Kpi
          label="A encaisser (creances)"
          value={receivables ? formatXof(receivables.total_outstanding) : "..."}
          sub={overdueReceivable.length ? `${formatXof(overdueAmount)} en retard (${overdueReceivable.length})` : "Aucun retard"}
          tone={overdueReceivable.length ? "red" : undefined}
          href="/admin/reports"
        />
        <Kpi
          label="A payer (fournisseurs)"
          value={payables ? formatXof(payables.total_outstanding) : "..."}
          sub={payables ? `${payables.rows.length} bon(s) de commande ouverts` : ""}
          href="/admin/reports"
        />
        <Kpi
          label="Devis en attente"
          value={overview ? String(openQuotes) : "..."}
          sub={overview ? `Conversion ${Math.round(overview.quotes.conversion_rate)} %` : ""}
          href="/admin/documents/quotes"
        />
        <Kpi
          label="Encaisse par factures"
          value={overview ? formatXof(overview.invoices.paid_on_these_invoices) : "..."}
          sub={overview ? `Reste ${formatXof(overview.invoices.outstanding)}` : ""}
        />
        <Kpi
          label="Achats du mois"
          value={overview ? formatXof(overview.purchases.ordered_total) : "..."}
          sub={overview ? `${overview.purchases.count} bon(s) de commande` : ""}
        />
        <Kpi
          label="Ecart de caisse net"
          value={discrepancies ? formatXof(net) : "..."}
          sub={discrepancies ? `Manque ${formatXof(Math.abs(discrepancies.shortage))} · Surplus ${formatXof(discrepancies.surplus)}` : ""}
          tone={net < 0 ? "red" : undefined}
          href="/admin/closing"
        />
      </div>

      {receivables && overdueReceivable.length > 0 && (
        <section className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-3">Factures en retard de paiement</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr>
                  <th className="py-2">Facture</th>
                  <th>Client</th>
                  <th>Echeance</th>
                  <th className="text-right">Retard</th>
                  <th className="text-right">Solde</th>
                </tr>
              </thead>
              <tbody>
                {overdueReceivable
                  .sort((a, b) => b.days_overdue - a.days_overdue)
                  .slice(0, 8)
                  .map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2">
                        <Link href={`/admin/documents/invoices/${r.id}`} className="text-brand font-medium">
                          {r.number}
                        </Link>
                      </td>
                      <td>{r.party}</td>
                      <td>{r.due_date ?? "-"}</td>
                      <td className="text-right text-red-600">{r.days_overdue} j</td>
                      <td className="text-right font-medium">{formatXof(r.balance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-3">Acces rapide</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SHORTCUTS.map((s) => (
            <Link key={s.href} href={s.href} className="bg-white border rounded-lg p-4 hover:border-brand transition">
              <p className="font-medium text-brand">{s.title}</p>
              <p className="text-sm text-gray-500 mt-1">{s.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, tone, href }: { label: string; value: string; sub?: string; tone?: "red"; href?: string }) {
  const body = (
    <div className={`bg-white border rounded-lg p-4 h-full ${href ? "hover:border-brand transition" : ""}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${tone === "red" ? "text-red-600" : ""}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${tone === "red" ? "text-red-500" : "text-gray-500"}`}>{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
