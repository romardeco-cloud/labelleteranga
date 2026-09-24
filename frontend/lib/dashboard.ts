import { api } from "./api";

export type Period = "day" | "month" | "year";

export type DashboardKpi = {
  key: "revenue" | "orders" | "expenses" | "net" | "ticket" | "tips";
  label: string;
  value: number;
  trend: number | null;
  kind: "money" | "count";
  hint: string;
};

export type Dashboard = {
  period: Period;
  date: string;
  range: { start: string; end: string; previous_start: string; previous_end: string };
  point_of_sale: string | null;
  kpis: DashboardKpi[];
  sites: { id: number | null; label: string; revenue: number; orders_count: number }[];
  series: { key: string; label: string; revenue: number }[];
  categories: { label: string; revenue: number; share: number }[];
  payment_methods: { key: string; label: string; amount: number; share: number }[];
  top_products: { name: string; quantity: number; revenue: number }[];
  alerts: { low_stock: number; low_stock_threshold: number; overdue_invoices: number; overdue_amount: number };
};

export async function fetchDashboard(period: Period, date: string, storeId?: number | null) {
  const { data } = await api.get<Dashboard>("/reports/dashboard/", {
    params: { period, date, ...(storeId ? { point_of_sale: storeId } : {}) },
  });
  return data;
}
