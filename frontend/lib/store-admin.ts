import { api } from "./api";

/* ---------- Categories par point de vente ---------- */
export type StoreCategory = {
  id: number;
  point_of_sale: number;
  category: number;
  name: string;
  default_name: string;
  display_name: string;
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
export async function renameStoreCategory(id: number, displayName: string) {
  return (await api.patch<StoreCategory>(`/stores/categories/${id}/`, { display_name: displayName })).data;
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
  track_stock: boolean;
  wave_pay_url: string;
  orange_pay_url: string;
  wave_number: string;
  orange_number: string;
  social_links: Record<string, string>;
  loyalty_enabled: boolean;
  loyalty_mode: "orders" | "amount";
  loyalty_threshold: number;
  loyalty_min_order: number;
  loyalty_reward_type: "percent" | "amount" | "gift";
  loyalty_reward_value: number | string;
  loyalty_reward_label: string;
  loyalty_valid_days: number;
  receipt_slogan: string;
  receipt_footer: string;
  module_hold: boolean;
  module_history: boolean;
  module_qr: boolean;
  module_dine_in: boolean;
  module_customer_orders: boolean;
  module_drawer: boolean;
  module_xreport: boolean;
  module_daily_menu: boolean;
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

export async function fetchSecondarySecurityCode() {
  return (await api.get<{ is_set: boolean }>("/accounts/security-code/secondary/")).data;
}
export async function saveSecondarySecurityCode(newPin: string, currentPin: string) {
  return (await api.post<{ is_set: boolean }>("/accounts/security-code/secondary/", { new_pin: newPin, current_pin: currentPin })).data;
}

export type StaffUser = { id: number; username: string; email: string; role: string; last_login: string | null };
export async function fetchStaff() {
  return (await api.get<StaffUser[]>("/accounts/staff/")).data;
}

/* ---------- Menu du jour / Speciaux du jour ---------- */
export type MenuKind = "lunch" | "special";

export type DailyMenuItem = {
  number: number;
  special_price: string | null;
  product: {
    id: number;
    name: string;
    image: string | null;
    price: string;
    effective_price: string;
    active_promotion_name: string | null;
    category: { id: number; name: string } | null;
    in_stock: boolean;
    description: string;
  };
};

export type DailyMenu = {
  id: number;
  date: string;
  kind: MenuKind;
  title: string;
  note: string;
  is_published: boolean;
  items: DailyMenuItem[];
};

export async function fetchDailyMenuAdmin(storeId: number, date: string, kind: MenuKind) {
  return (
    await api.get<{ menu: DailyMenu | null; previous: { product: number; special_price: string | null }[]; previous_date: string | null }>(
      "/stores/daily-menus/",
      { params: { point_of_sale: storeId, date, kind } }
    )
  ).data;
}
export async function saveDailyMenu(payload: {
  point_of_sale: number;
  date: string;
  kind: MenuKind;
  title: string;
  note: string;
  is_published: boolean;
  items: { product: number; special_price?: string | number | null }[];
}) {
  return (await api.post<DailyMenu>("/stores/daily-menus/", payload)).data;
}
export async function deleteDailyMenu(storeId: number, date: string, kind: MenuKind) {
  await api.delete("/stores/daily-menus/", { params: { point_of_sale: storeId, date, kind } });
}
