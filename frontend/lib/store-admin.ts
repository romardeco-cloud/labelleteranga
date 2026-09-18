import { api } from "./api";

/* ---------- Categories par point de vente ---------- */
export type StoreCategory = {
  id: number;
  point_of_sale: number;
  category: number;
  name: string;
  order: number;
  products_count: number;
  hidden_count: number;
  stock_total: number;
};

export async function fetchStoreCategories(storeId: number) {
  return (await api.get<StoreCategory[]>("/stores/categories/", { params: { point_of_sale: storeId } })).data;
}
export async function addStoreCategory(storeId: number, input: { category?: number; name?: string }) {
  return (await api.post<StoreCategory>("/stores/categories/", { point_of_sale: storeId, ...input })).data;
}
export async function setStoreCategoryOrder(id: number, order: number) {
  return (await api.patch<StoreCategory>(`/stores/categories/${id}/`, { order })).data;
}
export async function removeStoreCategory(id: number) {
  await api.delete(`/stores/categories/${id}/`);
}

/* ---------- Parametres d'un point de vente ---------- */
export type PayMethodKey = "cash" | "wave" | "orange_money" | "card";

export type StoreConfig = {
  id: number;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  slug: string | null;
  online_enabled: boolean;
  description: string;
  timezone: string;
  email: string;
  legal_form: string;
  share_capital: string | null;
  ninea: string;
  rccm: string;
  vat_rate: string;
  prices_include_vat: boolean;
  payment_methods: PayMethodKey[];
  receipt_slogan: string;
  receipt_footer: string;
  module_hold: boolean;
  module_history: boolean;
  module_qr: boolean;
  module_dine_in: boolean;
  module_customer_orders: boolean;
  module_drawer: boolean;
  module_xreport: boolean;
};

export async function fetchStoreConfig(storeId: number) {
  return (await api.get<StoreConfig>(`/stores/points-of-sale/${storeId}/settings/`)).data;
}
export async function saveStoreConfig(storeId: number, patch: Partial<StoreConfig>) {
  return (await api.patch<StoreConfig>(`/stores/points-of-sale/${storeId}/settings/`, patch)).data;
}

export async function fetchSecurityCode() {
  return (await api.get<{ is_set: boolean }>("/accounts/security-code/")).data;
}
export async function saveSecurityCode(newPin: string, currentPin?: string) {
  return (await api.post<{ is_set: boolean }>("/accounts/security-code/", { new_pin: newPin, current_pin: currentPin })).data;
}

export type StaffUser = { id: number; username: string; email: string; role: string; last_login: string | null };
export async function fetchStaff() {
  return (await api.get<StaffUser[]>("/accounts/staff/")).data;
}
