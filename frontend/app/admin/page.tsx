"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import SalesChart, { SalesPoint } from "@/components/SalesChart";

type Summary = {
  today: { revenue: number; orders_count: number };
  this_month: { revenue: number; orders_count: number };
  previous_month: { revenue: number; orders_count: number };
  this_year: { revenue: number; orders_count: number };
};

function formatXof(value: number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function Card({ title, revenue, orders }: { title: string; revenue: number; orders: number }) {
  return (
    <div className="border rounded-lg bg-white p-4">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-xl font-bold text-brand-dark">{formatXof(revenue)}</p>
      <p className="text-xs text-gray-400">{orders} commande(s)</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<SalesPoint[]>([]);
  const [monthly, setMonthly] = useState<SalesPoint[]>([]);
  const [previousMonths, setPreviousMonths] = useState<SalesPoint[]>([]);
  const [yearly, setYearly] = useState<SalesPoint[]>([]);

  useEffect(() => {
    api.get("/reports/summary/").then((res) => setSummary(res.data));

    api.get("/reports/daily/", { params: { days: 30 } }).then((res) =>
      setDaily(res.data.map((d: any) => ({ label: d.day, revenue: Number(d.revenue), orders_count: d.orders_count })))
    );
    api.get("/reports/monthly/").then((res) =>
      setMonthly(
        res.data.map((d: any) => ({
          label: new Date(d.month).toLocaleDateString("fr-SN", { month: "short" }),
          revenue: Number(d.revenue),
          orders_count: d.orders_count,
        }))
      )
    );
    api.get("/reports/previous-months/", { params: { count: 6 } }).then((res) =>
      setPreviousMonths(
        res.data.map((d: any) => ({
          label: new Date(d.month).toLocaleDateString("fr-SN", { month: "short", year: "2-digit" }),
          revenue: Number(d.revenue),
          orders_count: d.orders_count,
        }))
      )
    );
    api.get("/reports/yearly/").then((res) =>
      setYearly(
        res.data.map((d: any) => ({
          label: new Date(d.year).getFullYear().toString(),
          revenue: Number(d.revenue),
          orders_count: d.orders_count,
        }))
      )
    );
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Tableau de bord des ventes</h1>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card title="Aujourd'hui" revenue={summary.today.revenue} orders={summary.today.orders_count} />
          <Card title="Ce mois-ci" revenue={summary.this_month.revenue} orders={summary.this_month.orders_count} />
          <Card
            title="Mois precedent"
            revenue={summary.previous_month.revenue}
            orders={summary.previous_month.orders_count}
          />
          <Card title="Cette annee" revenue={summary.this_year.revenue} orders={summary.this_year.orders_count} />
        </div>
      )}

      <section>
        <h2 className="font-semibold mb-2">Ventes des 30 derniers jours</h2>
        <SalesChart data={daily} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">Ventes mensuelles (annee en cours)</h2>
        <SalesChart data={monthly} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">6 derniers mois (glissant)</h2>
        <SalesChart data={previousMonths} />
      </section>

      <section>
        <h2 className="font-semibold mb-2">Ventes annuelles</h2>
        <SalesChart data={yearly} />
      </section>
    </div>
  );
}
