"use client";

import SealBlock from "@/components/SealBlock";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Icon, { IconName } from "@/components/admin/Icon";
import PendingCorrections from "@/components/admin/PendingCorrections";
import ProductSalesReport from "@/components/ProductSalesReport";
import { PointOfSale, fetchPointsOfSale } from "@/lib/api";
import { Dashboard, DashboardKpi, Period, fetchDashboard } from "@/lib/dashboard";
import { formatXof } from "@/lib/documents";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Jour" },
  { key: "month", label: "Mois" },
  { key: "year", label: "Annee" },
];

const CATEGORY_COLORS = ["#f5b942", "#ef4444", "#34d399", "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#2dd4bf"];
const METHOD_COLORS: Record<string, string> = {
  wave: "#22b8ff",
  orange_money: "#ff7a1a",
  cash: "#34d399",
  card: "#a78bfa",
  bank_transfer: "#94a3b8",
  cheque: "#f472b6",
};

const KPI_STYLE: Record<DashboardKpi["key"], { icon: IconName; tile: string }> = {
  revenue: { icon: "dollar", tile: "bg-sky-500/15 text-sky-400" },
  orders: { icon: "bag", tile: "bg-emerald-500/15 text-emerald-400" },
  expenses: { icon: "wallet", tile: "bg-rose-500/15 text-rose-400" },
  net: { icon: "trendUp", tile: "bg-amber-500/15 text-amber-400" },
  ticket: { icon: "receipt", tile: "bg-teal-500/15 text-teal-400" },
  tips: { icon: "gift", tile: "bg-fuchsia-500/15 text-fuchsia-400" },
};

/* ---------- dates (toujours en heure locale, format YYYY-MM-DD) ---------- */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
function shift(date: string, period: Period, dir: 1 | -1) {
  const d = parse(date);
  if (period === "day") d.setDate(d.getDate() + dir);
  else if (period === "month") d.setMonth(d.getMonth() + dir, 1);
  else d.setFullYear(d.getFullYear() + dir, 0, 1);
  return iso(d);
}
function label(date: string, period: Period) {
  const d = parse(date);
  if (period === "day") return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  if (period === "month") return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return String(d.getFullYear());
}
const periodKey = (d: string, period: Period) => d.slice(0, period === "year" ? 4 : period === "month" ? 7 : 10);
const isFuture = (date: string, period: Period) => periodKey(shift(date, period, 1), period) > periodKey(iso(new Date()), period);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bonjour" : h < 18 ? "Bon apres-midi" : "Bonsoir";
}

const compact = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<Period>("day");
  const [date, setDate] = useState(iso(new Date()));
  const [storeId, setStoreId] = useState<number | null>(null);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchPointsOfSale()
      .then((s) => setStores(s.filter((x) => x.is_active)))
      .catch(() => setStores([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchDashboard(period, date, storeId)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [period, date, storeId]);

  useEffect(load, [load]);

  const storeName = stores.find((s) => s.id === storeId)?.name;
  const maxSite = useMemo(() => Math.max(1, ...(data?.sites.map((s) => s.revenue) ?? [1])), [data]);
  const catTotal = data?.categories.reduce((n, c) => n + c.revenue, 0) ?? 0;
  const chartTitle =
    period === "day" ? "Ventes des 7 derniers jours" : period === "month" ? "Ventes du mois, jour par jour" : "Ventes de l'annee, mois par mois";

  return (
    <div className="space-y-6">
      {/* En-tete */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting()}, <span className="text-[#f5b942]">La Belle Teranga</span>
          </h1>
          <p className="text-sm text-gray-500">
            {storeName ? storeName : `Vue consolidee — ${stores.length} sites`}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => window.print()} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm hover:bg-white/5">
            <Icon name="printer" className="w-4 h-4" /> Imprimer
          </button>
          <button onClick={load} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm hover:bg-white/5">
            <Icon name="refresh" className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
      </div>

      {/* Demandes des caissiers en attente */}
      <PendingCorrections />

      {/* Acces rapide */}
      <div className="grid sm:grid-cols-2 gap-4 print:hidden">
        <Link
          href="/admin/orders"
          className="flex items-center gap-4 border border-[#f5b942]/30 bg-[#f5b942]/10 rounded-xl p-4 hover:bg-[#f5b942]/15"
        >
          <Icon name="receipt" className="w-6 h-6 text-[#f5b942]" />
          <div>
            <p className="font-semibold">Annuler ou corriger une vente</p>
            <p className="text-sm text-gray-500">Commandes et ventes : supprimer une vente validee ou corriger son mode de paiement</p>
          </div>
        </Link>
      </div>

      {/* Filtres : site + periode */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex flex-wrap gap-1 border rounded-xl p-1 bg-[#1c1514]">
          <button
            onClick={() => setStoreId(null)}
            className={`px-3 py-1.5 rounded-lg text-sm ${storeId === null ? "bg-[#b3261e] text-white" : "text-gray-500 hover:text-white"}`}
          >
            Consolide
          </button>
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => setStoreId(s.id)}
              title={s.name}
              className={`px-3 py-1.5 rounded-lg text-sm max-w-[11rem] truncate ${
                storeId === s.id ? "bg-[#b3261e] text-white" : "text-gray-500 hover:text-white"
              }`}
            >
              {s.name.replace(/ La Belle Teranga$/i, "")}
            </button>
          ))}
        </div>
        <div className="flex gap-1 border rounded-xl p-1 bg-[#1c1514]">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm ${period === p.key ? "bg-[#f5b942] text-[#241010] font-medium" : "text-gray-500 hover:text-white"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation dans le temps */}
      <div className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-[#1c1514] print:border-0">
        <Icon name="calendar" className="w-4 h-4 text-gray-500 print:hidden" />
        <button onClick={() => setDate(shift(date, period, -1))} aria-label="Precedent" className="p-1.5 border rounded-lg hover:bg-white/5 print:hidden">
          <Icon name="chevronLeft" className="w-4 h-4" />
        </button>
        <span className="font-semibold min-w-[12rem] text-center first-letter:uppercase">{label(date, period)}</span>
        <button
          onClick={() => setDate(shift(date, period, 1))}
          disabled={isFuture(date, period)}
          aria-label="Suivant"
          className="p-1.5 border rounded-lg hover:bg-white/5 disabled:opacity-30 print:hidden"
        >
          <Icon name="chevronRight" className="w-4 h-4" />
        </button>
        <input
          type="date"
          value={date}
          max={iso(new Date())}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="ml-auto border rounded-lg px-2 py-1 text-sm print:hidden"
        />
        <button onClick={() => setDate(iso(new Date()))} className="text-sm text-[#f5b942] px-2 print:hidden">
          Aujourd&apos;hui
        </button>
      </div>

      {error && <p className="text-sm bg-red-50 text-red-700 p-3 rounded-lg">Impossible de charger les statistiques. Reessayez.</p>}

      {/* Indicateurs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {(data?.kpis ?? Array.from({ length: 6 }, () => null)).map((k, i) => {
          if (!k) return <div key={i} className="border rounded-xl bg-[#1c1514] h-36 animate-pulse" />;
          const style = KPI_STYLE[k.key];
          const up = (k.trend ?? 0) >= 0;
          // pour les depenses, une hausse est defavorable
          const good = k.key === "expenses" ? !up : up;
          return (
            <div key={k.key} className="border rounded-xl bg-[#1c1514] p-4" title={k.hint}>
              <div className="flex items-start justify-between">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${style.tile}`}>
                  <Icon name={style.icon} />
                </span>
                {k.trend !== null && (
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${
                      good ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                    }`}
                  >
                    <Icon name={up ? "trendUp" : "trendDown"} className="w-3 h-3" />
                    {Math.abs(k.trend)}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold mt-3 leading-tight">{k.kind === "money" ? formatXof(k.value) : k.value}</p>
              <p className="text-sm text-gray-500 mt-1">{k.label}</p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Variation par rapport a la periode precedente. Chiffre d&apos;affaires = ventes (caisse + en ligne) + factures encaissees ; depenses = paiements
        fournisseurs.
      </p>

      {/* Comparaison des sites */}
      {!storeId && data && data.sites.length > 0 && (
        <section className="border rounded-xl bg-[#1c1514]">
          <div className="p-5 border-b">
            <h2 className="font-semibold">Comparaison des sites</h2>
            <p className="text-sm text-gray-500">Chiffre d&apos;affaires de la periode</p>
          </div>
          <div className="p-5 space-y-5">
            {data.sites.map((s) => (
              <div key={s.label}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <button
                    onClick={() => s.id && setStoreId(s.id)}
                    className={`font-medium text-left ${s.id ? "hover:text-[#f5b942]" : "cursor-default"}`}
                  >
                    {s.label}
                  </button>
                  <span className="text-sm whitespace-nowrap">
                    <span className="text-gray-500 mr-3">{s.orders_count} vente(s)</span>
                    <span className="font-bold">{formatXof(s.revenue)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#b3261e] to-[#f5b942]"
                    style={{ width: `${Math.max(s.revenue > 0 ? 2 : 0, (s.revenue / maxSite) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Courbe + categories */}
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 border rounded-xl bg-[#1c1514] p-5">
          <h2 className="font-semibold">{chartTitle}</h2>
          <p className="text-sm text-gray-500 mb-3">{storeName ?? "Total consolide de tous les sites"}</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.series ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5b942" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#f5b942" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#33272a" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" stroke="#a99b96" fontSize={12} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#a99b96" fontSize={12} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
                <Tooltip
                  cursor={{ stroke: "#f5b942", strokeOpacity: 0.3 }}
                  contentStyle={{ background: "#251c1a", border: "1px solid #4a3a37", borderRadius: 8, color: "#f1ebe8" }}
                  formatter={(v) => [formatXof(Number(v)), "Chiffre d'affaires"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#f5b942" strokeWidth={2.5} fill="url(#rev)" dot={{ r: 3, fill: "#f5b942" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="border rounded-xl bg-[#1c1514] p-5">
          <h2 className="font-semibold">Apercu par categories</h2>
          <p className="text-sm text-gray-500 mb-2">Ventes caisse + en ligne</p>
          {data && data.categories.length > 0 ? (
            <>
              <div className="h-44 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.categories} dataKey="revenue" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
                      {data.categories.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#251c1a", border: "1px solid #4a3a37", borderRadius: 8, color: "#f1ebe8" }}
                      formatter={(v) => formatXof(Number(v))}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="font-bold text-sm">{compact(catTotal)}</span>
                  <span className="text-xs text-gray-500">Total</span>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {data.categories.slice(0, 6).map((c, i) => (
                  <li key={c.label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      <span className="truncate">{c.label}</span>
                    </span>
                    <span className="text-gray-500">{c.share}%</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-500 py-10 text-center">Aucune vente sur cette periode.</p>
          )}
        </section>
      </div>

      {/* Paiements + meilleurs produits */}
      <div className="grid lg:grid-cols-2 gap-4">
        <section className="border rounded-xl bg-[#1c1514] p-5">
          <h2 className="font-semibold">Modes de paiement</h2>
          <p className="text-sm text-gray-500 mb-4">Wave, Orange Money, especes, carte... (ventes + factures)</p>
          {data && data.payment_methods.length > 0 ? (
            <div className="space-y-4">
              {data.payment_methods.map((m) => (
                <div key={m.key}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: METHOD_COLORS[m.key] ?? "#94a3b8" }} />
                      {m.label}
                    </span>
                    <span>
                      <span className="text-gray-500 mr-3">{m.share}%</span>
                      <span className="font-semibold">{formatXof(m.amount)}</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.share}%`, background: METHOD_COLORS[m.key] ?? "#94a3b8" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 py-6 text-center">Aucun encaissement sur cette periode.</p>
          )}
        </section>

        <section className="border rounded-xl bg-[#1c1514] p-5">
          <h2 className="font-semibold">Meilleurs produits</h2>
          <p className="text-sm text-gray-500 mb-3">Par chiffre d&apos;affaires</p>
          {data && data.top_products.length > 0 ? (
            <table className="w-full text-sm">
              <tbody>
                {data.top_products.map((p, i) => (
                  <tr key={p.name} className="border-t first:border-0">
                    <td className="py-2 w-7 text-gray-500">{i + 1}</td>
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-right text-gray-500">x{p.quantity}</td>
                    <td className="py-2 text-right font-semibold">{formatXof(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500 py-6 text-center">Aucune vente sur cette periode.</p>
          )}
        </section>
      </div>

      {/* Alertes */}
      {data && (data.alerts.low_stock > 0 || data.alerts.overdue_invoices > 0) && (
        <div className="grid sm:grid-cols-2 gap-4 print:hidden">
          {data.alerts.low_stock > 0 && (
            <Link href="/admin/inventory" className="flex items-center gap-4 border border-amber-500/30 bg-amber-500/10 rounded-xl p-4 hover:bg-amber-500/15">
              <Icon name="alert" className="w-6 h-6 text-amber-400" />
              <div>
                <p className="font-semibold">{data.alerts.low_stock} produit(s) en stock bas</p>
                <p className="text-sm text-gray-500">{data.alerts.low_stock_threshold} unites ou moins — lancer un inventaire</p>
              </div>
            </Link>
          )}
          {data.alerts.overdue_invoices > 0 && (
            <Link
              href="/admin/documents/invoices?payment_status=unpaid"
              className="flex items-center gap-4 border border-rose-500/30 bg-rose-500/10 rounded-xl p-4 hover:bg-rose-500/15"
            >
              <Icon name="alert" className="w-6 h-6 text-rose-400" />
              <div>
                <p className="font-semibold">{data.alerts.overdue_invoices} facture(s) en retard</p>
                <p className="text-sm text-gray-500">{formatXof(data.alerts.overdue_amount)} a recouvrer</p>
              </div>
            </Link>
          )}
        </div>
      )}

      <section className="border rounded-xl bg-[#1c1514] p-5 print:hidden">
        <ProductSalesReport />
      </section>
      <SealBlock printOnly />
    </div>
  );
}
