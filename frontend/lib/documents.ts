import { api } from "./api";
import { getAdminToken } from "./auth";
import { sealParam } from "@/lib/sealOpts";

export type DocType = "quotes" | "invoices" | "purchase-orders";

export const DOC_CONFIG: Record<
  DocType,
  { label: string; singular: string; fem: boolean; party: "customer" | "supplier"; partyLabel: string; dateLabel2: string }
> = {
  quotes: { label: "Devis", singular: "Devis", fem: false, party: "customer", partyLabel: "Client", dateLabel2: "Valable jusqu'au" },
  invoices: { label: "Factures", singular: "Facture", fem: true, party: "customer", partyLabel: "Client", dateLabel2: "Echeance" },
  "purchase-orders": {
    label: "Bons de commande",
    singular: "Bon de commande",
    fem: false,
    party: "supplier",
    partyLabel: "Fournisseur",
    dateLabel2: "Livraison prevue",
  },
};

export const PAYMENT_METHODS = [
  { value: "cash", label: "Especes" },
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "card", label: "Carte bancaire" },
  { value: "bank_transfer", label: "Virement bancaire" },
  { value: "cheque", label: "Cheque" },
];

export type Party = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  tax_id: string;
  notes: string;
};

export type DocLine = {
  category?: string;
  id?: number;
  product: number | null;
  description: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  line_total?: string;
  received_quantity?: string;
};

export type DocPayment = {
  id: number;
  method: string;
  method_label: string;
  amount: string;
  date: string;
  reference: string;
  notes: string;
};

export type DocumentData = {
  id: number;
  number: string;
  customer?: number;
  customer_name?: string;
  supplier?: number;
  supplier_name?: string;
  point_of_sale: number | null;
  point_of_sale_name: string | null;
  date: string;
  valid_until?: string | null;
  due_date?: string | null;
  expected_date?: string | null;
  status: string;
  status_label: string;
  is_expired?: boolean;
  is_overdue?: boolean;
  tax_rate: string;
  payment_method: string;
  payment_method_label: string;
  payment_terms?: string;
  notes: string;
  items: DocLine[];
  subtotal: string;
  tax_amount: string;
  total: string;
  paid_amount?: string;
  balance?: string;
  payment_status?: "unpaid" | "partial" | "paid" | "cancelled";
  payments?: DocPayment[];
  invoice_id?: number | null;
  invoice_number?: string | null;
  source_quote_number?: string | null;
  stock_deducted?: boolean;
  created_by_username: string | null;
};

const path = (type: DocType) => `/documents/${type}/`;

export async function listDocuments(type: DocType, params: Record<string, string> = {}) {
  const { data } = await api.get(path(type), { params: { page_size: 200, ...params } });
  return (data.results ?? data) as DocumentData[];
}

export async function getDocument(type: DocType, id: number | string) {
  const { data } = await api.get<DocumentData>(`${path(type)}${id}/`);
  return data;
}

export async function saveDocument(type: DocType, payload: Record<string, unknown>, id?: number) {
  const { data } = id
    ? await api.patch<DocumentData>(`${path(type)}${id}/`, payload)
    : await api.post<DocumentData>(path(type), payload);
  return data;
}

export async function documentAction(type: DocType, id: number, action: string, body: Record<string, unknown> = {}) {
  const { data } = await api.post<DocumentData>(`${path(type)}${id}/${action}/`, body);
  return data;
}

export async function listParties(kind: "customers" | "suppliers") {
  const { data } = await api.get(`/documents/${kind}/`, { params: { page_size: 500 } });
  return (data.results ?? data) as Party[];
}

export async function saveParty(kind: "customers" | "suppliers", payload: Partial<Party>, id?: number) {
  const { data } = id
    ? await api.patch<Party>(`/documents/${kind}/${id}/`, payload)
    : await api.post<Party>(`/documents/${kind}/`, payload);
  return data;
}

export async function deleteParty(kind: "customers" | "suppliers", id: number) {
  await api.delete(`/documents/${kind}/${id}/`);
}

export function apiErrorMessage(err: unknown, fallback = "Operation impossible.") {
  const d = (err as { response?: { data?: unknown } })?.response?.data;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.join(" ");
  return Object.values(d as Record<string, unknown>)
    .flat()
    .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
    .join(" ");
}

export function formatXof(value: number | string | null | undefined) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value ?? 0)) + " FCFA";
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Ouvre un PDF du serveur dans un nouvel onglet (impression, enregistrement, envoi). */
export async function openPdf(path: string, params: Record<string, string | number> = {}) {
  const win = window.open("", "_blank"); // ouvert tout de suite pour ne pas etre bloque par le navigateur
  try {
    const seal = sealParam(); // cachet, signature et mention choisis sur cet appareil
    const all = seal !== undefined && !("seal" in params) ? { ...params, seal } : params;
    const qs = new URLSearchParams(Object.entries(all).map(([k, v]) => [k, String(v)])).toString();
    const res = await fetch(`${api.defaults.baseURL}${path}${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${getAdminToken()}` },
    });
    if (!res.ok) throw new Error("pdf");
    const url = window.URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}

export async function downloadExport(start: string, end: string, storeId?: number | null) {
  const params = new URLSearchParams({ start, end });
  if (storeId) params.set("point_of_sale", String(storeId));
  const res = await fetch(`${api.defaults.baseURL}/reports/export/?${params}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  });
  if (!res.ok) throw new Error("export");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapports_labelleteranga_${start}_${end}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

/* ---------- Rapports ---------- */

export type Bucket = { key: string; label: string; revenue: number; orders_count: number };

export type Overview = {
  period: { start: string; end: string; point_of_sale: string | null };
  sales: {
    revenue: number;
    orders_count: number;
    tips: number;
    average_ticket: number;
    by_payment_method: Bucket[];
    by_channel: Bucket[];
    by_store: { label: string; revenue: number; orders_count: number }[];
    by_cashier: { label: string; revenue: number; orders_count: number }[];
    by_day: { day: string; revenue: number; orders_count: number }[];
  };
  invoices: {
    count: number;
    invoiced_total: number;
    paid_on_these_invoices: number;
    outstanding: number;
    collected_in_period_by_method: { label: string; amount: number }[];
  };
  quotes: { count: number; total: number; by_status: Record<string, number>; accepted_value: number; conversion_rate: number };
  purchases: { count: number; ordered_total: number; paid_in_period_by_method: { label: string; amount: number }[] };
  cash_in_by_method: { key: string; label: string; amount: number }[];
  cash_discrepancies: { closings_count: number; with_discrepancy: number; shortage: number; surplus: number; net: number };
};

export type InventoryRow = {
  store: string;
  sku: string;
  product: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  value: number;
};

export type Inventory = {
  threshold: number;
  note: string;
  totals: { units: number; value: number };
  by_store: { store: string; units: number; value: number; references: number }[];
  low_stock: InventoryRow[];
  rows: InventoryRow[];
};

export type OpenDocs = {
  total_outstanding: number;
  aging: { bucket: string; amount: number }[];
  rows: { id: number; number: string; party: string; date: string; due_date: string | null; total: number; paid: number; balance: number; days_overdue: number; bucket: string }[];
};

export type DiscrepancyReport = {
  rows: {
    id: number;
    date: string;
    store: string;
    cashier: string | null;
    expected: number;
    declared: number;
    discrepancy: number;
    initial_discrepancy: number | null;
    corrections: number;
    notes: string;
  }[];
  shortage: number;
  surplus: number;
  net: number;
};

const rp = (start: string, end: string, storeId?: number | null) => ({
  start,
  end,
  ...(storeId ? { point_of_sale: storeId } : {}),
});

export async function fetchOverview(start: string, end: string, storeId?: number | null) {
  return (await api.get<Overview>("/reports/overview/", { params: rp(start, end, storeId) })).data;
}
export async function fetchInventory(threshold: number, storeId?: number | null) {
  return (await api.get<Inventory>("/reports/inventory/", { params: { threshold, ...(storeId ? { point_of_sale: storeId } : {}) } })).data;
}
export async function fetchReceivables() {
  return (await api.get<OpenDocs>("/reports/receivables/")).data;
}
export async function fetchPayables() {
  return (await api.get<OpenDocs>("/reports/payables/")).data;
}
export async function fetchDiscrepancies(start: string, end: string, storeId?: number | null) {
  return (await api.get<DiscrepancyReport>("/reports/cash-discrepancies/", { params: rp(start, end, storeId) })).data;
}

/* ---------- Inventaire ---------- */

export type InventoryLine = {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  category: string | null;
  unit_price: string;
  theoretical_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
};

export type InventoryCount = {
  id: number;
  number: string;
  point_of_sale: number;
  point_of_sale_name: string;
  date: string;
  status: "draft" | "validated" | "cancelled";
  status_label: string;
  notes: string;
  created_by_username: string | null;
  validated_at: string | null;
  lines_count: number;
  counted_count: number;
  variance_units: number;
  variance_value: number;
  lines?: InventoryLine[];
  moved_since_snapshot?: number;
  import_result?: { updated: number; errors: string[] };
};

export type StockMovement = {
  id: number;
  product_name: string;
  product_sku: string;
  point_of_sale_name: string;
  delta: number;
  quantity_after: number;
  reason: string;
  reason_label: string;
  reference: string;
  user_username: string | null;
  created_at: string;
};

export const MOVEMENT_REASONS = [
  { value: "sale_pos", label: "Vente en caisse" },
  { value: "invoice", label: "Facture client" },
  { value: "invoice_cancel", label: "Annulation de facture" },
  { value: "purchase_receipt", label: "Reception fournisseur" },
  { value: "manual", label: "Correction manuelle" },
  { value: "inventory", label: "Ajustement d'inventaire" },
  { value: "import", label: "Import Excel" },
];

export async function listInventories() {
  const { data } = await api.get("/stores/inventories/", { params: { page_size: 200 } });
  return (data.results ?? data) as InventoryCount[];
}
export async function getInventory(id: number | string) {
  return (await api.get<InventoryCount>(`/stores/inventories/${id}/`)).data;
}
export async function createInventory(payload: { point_of_sale: number; date: string; notes?: string; category?: number | null }) {
  return (await api.post<InventoryCount>("/stores/inventories/", payload)).data;
}
export async function saveInventoryCounts(id: number, counts: { product: number; counted_quantity: number | null }[]) {
  return (await api.post<InventoryCount>(`/stores/inventories/${id}/set-counts/`, { counts })).data;
}
export async function inventoryAction(id: number, action: "validate" | "cancel") {
  return (await api.post<InventoryCount>(`/stores/inventories/${id}/${action}/`)).data;
}
export async function deleteInventory(id: number) {
  await api.delete(`/stores/inventories/${id}/`);
}
export async function importInventoryCounts(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return (await api.post<InventoryCount>(`/stores/inventories/${id}/import-counts/`, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
}
export async function listMovements(params: Record<string, string | number>) {
  const { data } = await api.get("/stores/movements/", { params });
  return data as { count: number; next: string | null; results: StockMovement[] };
}

export async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${api.defaults.baseURL}${path}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  });
  if (!res.ok) throw new Error("download");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
