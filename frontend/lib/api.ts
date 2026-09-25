import axios from "axios";
import { getActiveStore } from "./site";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Le contexte (caisse vs admin) depend de la PAGE affichee, pas de l'API appelee : certaines actions de la
    // caisse (annuler/corriger une vente) appellent /orders/... , pas seulement /pos/... . Sur
    // caisse.labelleteranga.com (et caisse-<magasin>.), le proxy reecrit "/" vers "/caisse" cote serveur : le
    // chemin visible du navigateur reste "/", d'ou la verification par sous-domaine en plus du chemin.
    const host = window.location.hostname;
    const isPos = host === "caisse.labelleteranga.com" || host.startsWith("caisse-") || window.location.pathname.startsWith("/caisse");
    const token = localStorage.getItem(isPos ? "lbt_cashier_token" : "lbt_admin_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export type Category = {
  id: number;
  name: string;
  slug: string;
};

export type PointOfSale = {
  track_stock?: boolean;
  id: number;
  name: string;
  slug?: string | null;
  online_enabled?: boolean;
  description?: string;
  address: string;
  phone: string;
  is_active: boolean;
  created_at: string;
};

export type Stock = {
  track_stock?: boolean;
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  point_of_sale: number;
  point_of_sale_name: string;
  quantity: number;
  updated_at: string;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  slug: string;
  description: string;
  category: Category | null;
  price: string;
  compare_at_price: string | null;
  effective_price: string;
  active_promotion_name: string | null;
  total_stock: number;
  stocks: Stock[];
  unit: string;
  image: string | null;
  is_active: boolean;
  in_stock: boolean;
  combo_items?: string[];
};

export async function fetchCategories() {
  const { data } = await api.get("/catalog/categories/", { params: { page_size: 100 } });
  return (data.results ?? data) as Category[];
}

export async function createCategory(name: string) {
  const { data } = await api.post<Category>("/catalog/categories/", { name });
  return data;
}

export async function updateProduct(id: number, input: Record<string, unknown> | FormData) {
  const { data } = await api.patch<Product>(`/catalog/products/${id}/`, input);
  return data;
}

export type DiscountType = "percent" | "fixed";

export type Promotion = {
  id: number;
  name: string;
  discount_type: DiscountType;
  value: string;
  category: number | null;
  category_name: string | null;
  products: number[];
  product_names: string[];
  point_of_sale: number | null;
  point_of_sale_name: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_current: boolean;
  created_at: string;
};

export async function fetchPromotions() {
  const { data } = await api.get("/catalog/promotions/", { params: { page_size: 100 } });
  return (data.results ?? data) as Promotion[];
}

export async function createPromotion(input: Partial<Promotion>) {
  const { data } = await api.post<Promotion>("/catalog/promotions/", input);
  return data;
}

export async function updatePromotion(id: number, input: Partial<Promotion>) {
  const { data } = await api.patch<Promotion>(`/catalog/promotions/${id}/`, input);
  return data;
}

export async function deletePromotion(id: number) {
  await api.delete(`/catalog/promotions/${id}/`);
}

export async function fetchPointsOfSale() {
  const { data } = await api.get("/stores/points-of-sale/", { params: { page_size: 100 } });
  return (data.results ?? data) as PointOfSale[];
}

export async function createPointOfSale(input: { name: string; address?: string; phone?: string; description?: string; slug?: string; online_enabled?: boolean; is_active?: boolean }) {
  const { data } = await api.post<PointOfSale>("/stores/points-of-sale/", input);
  return data;
}

export async function updatePointOfSale(id: number, input: Partial<PointOfSale>) {
  const { data } = await api.patch<PointOfSale>(`/stores/points-of-sale/${id}/`, input);
  return data;
}

export async function setStock(productId: number, pointOfSaleId: number, quantity: number) {
  const { data } = await api.post<Stock>("/stores/stock/set/", {
    product: productId,
    point_of_sale: pointOfSaleId,
    quantity,
  });
  return data;
}

export type CartItem = {
  id: number;
  product: Product;
  quantity: number;
  subtotal: string;
};

export type CartData = {
  id: number;
  session_key: string;
  items: CartItem[];
  total: string;
};

// Panier separe pour chaque site (supermarche, resto...) : cle de session propre au site actif.
const notifyCartChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("lbt-cart-changed"));
};

export function getSessionKey(): string {
  if (typeof window === "undefined") return "";
  const storageKey = `lbt_cart_session${getActiveStore() ? `_${getActiveStore()}` : ""}`;
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(storageKey, key);
  }
  return key;
}

export async function fetchProducts(params: Record<string, string> = {}) {
  const { data } = await api.get("/catalog/products/", { params });
  return data;
}

export async function fetchCart() {
  const store = getActiveStore();
  const { data } = await api.get<CartData>(`/cart/${getSessionKey()}/`, { params: store ? { store } : {} });
  return data;
}

export async function addToCart(productId: number, quantity = 1) {
  const { data } = await api.post<CartData>(`/cart/${getSessionKey()}/add/`, {
    product_id: productId,
    quantity,
    store: getActiveStore(),
  });
  notifyCartChanged();
  return data;
}

export async function updateCartItem(itemId: number, quantity: number) {
  const { data } = await api.patch<CartData>(`/cart/${getSessionKey()}/items/${itemId}/`, { quantity });
  notifyCartChanged();
  return data;
}

export async function removeCartItem(itemId: number) {
  const { data } = await api.delete<CartData>(`/cart/${getSessionKey()}/items/${itemId}/`);
  notifyCartChanged();
  return data;
}

export type PaymentMethod = "card" | "wave" | "orange_money" | "cash";

export type CustomerInfo = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  fulfillment?: "delivery" | "pickup";
  use_reward?: boolean;
  tip_amount?: number;
};

export type Order = {
  id: number;
  reference: string;
  channel?: "online" | "pos";
  fulfillment?: "delivery" | "pickup";
  point_of_sale: number | null;
  point_of_sale_name: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  delivery_latitude: string | null;
  delivery_longitude: string | null;
  location_maps_url: string | null;
  status: "pending" | "paid" | "failed" | "cancelled";
  payment_method: PaymentMethod;
  total_amount: string;
  discount_amount?: string;
  tip_amount?: string;
  reward_label?: string;
  items: CartItem[];
  created_at: string;
  paid_at: string | null;
  voided_at?: string | null;
  payment_method_changed_at?: string | null;
  payment_method_changed_by_username?: string | null;
  payment_method_change_reason?: string;
  pending_action?: "" | "void" | "change_payment";
  pending_payment_method?: PaymentMethod | "";
  pending_reason?: string;
  pending_requested_by_username?: string | null;
  pending_requested_at?: string | null;
  order_number?: string;
  whatsapp_status?: string;
  payment_reference?: string;
  payment_declared_at?: string | null;
  whatsapp_confirmation_sent_at: string | null;
  customer_whatsapp_link: string | null;
  shop_whatsapp_link: string | null;
};

const CHECKOUT_ENDPOINTS: Record<Exclude<PaymentMethod, "cash">, string> = {
  card: "/payments/create-checkout-session/",
  wave: "/payments/wave/create-checkout/",
  orange_money: "/payments/orange-money/create-checkout/",
};

export async function createCheckoutSession(method: Exclude<PaymentMethod, "cash">, customer: CustomerInfo) {
  const { data } = await api.post(CHECKOUT_ENDPOINTS[method], {
    session_key: getSessionKey(),
    ...customer,
  });
  return data as { checkout_url: string; order_reference: string };
}

export async function createManualOrder(method: "wave" | "orange_money", customer: CustomerInfo) {
  const { data } = await api.post("/payments/manual-order/", {
    session_key: getSessionKey(),
    payment_method: method,
    ...customer,
  });
  notifyCartChanged();
  return data as Order;
}

export async function declarePayment(reference: string, paymentReference: string) {
  const { data } = await api.post<Order>(`/payments/orders/${reference}/declare-payment/`, { payment_reference: paymentReference });
  return data;
}

export async function createCashOrder(customer: CustomerInfo) {
  const { data } = await api.post("/payments/cash-order/", {
    session_key: getSessionKey(),
    ...customer,
  });
  return data as Order;
}

export async function fetchOrder(reference: string) {
  const { data } = await api.get<Order>(`/orders/${reference}/`);
  return data;
}

export async function markOrderPaid(reference: string) {
  const { data } = await api.post<Order>(`/payments/orders/${reference}/mark-paid/`);
  return data;
}

export async function setOrderPointOfSale(reference: string, pointOfSaleId: number | null) {
  const { data } = await api.patch<Order>(`/orders/${reference}/`, { point_of_sale: pointOfSaleId });
  return data;
}

export type PaymentBreakdownRow = {
  payment_method: PaymentMethod;
  revenue: number;
  orders_count: number;
};

export async function fetchPaymentBreakdown(period: "today" | "month" | "year", pointOfSaleId?: number | null) {
  const { data } = await api.get<PaymentBreakdownRow[]>("/reports/by-payment-method/", {
    params: { period, ...(pointOfSaleId ? { point_of_sale: pointOfSaleId } : {}) },
  });
  return data;
}

export type DailyClosing = {
  id: number;
  date: string;
  point_of_sale: number | null;
  point_of_sale_name: string | null;
  cashier_username: string | null;
  initial_discrepancy_total: string;
  revision_count: number;
  closed_by_username: string | null;
  closed_at: string;
  updated_at: string;
  expected_card: string;
  expected_wave: string;
  expected_orange_money: string;
  expected_cash: string;
  expected_total: string;
  declared_card: string;
  declared_wave: string;
  declared_orange_money: string;
  declared_cash: string;
  declared_total: string;
  discrepancy_card: string;
  discrepancy_wave: string;
  discrepancy_orange_money: string;
  discrepancy_cash: string;
  discrepancy_total: string;
  notes: string;
  auto_closed: boolean;
  covers_from: string | null;
  covers_through: string | null;
};

export type ClosingPreview = {
  date: string;
  point_of_sale: string | null;
  expected: { card: number; wave: number; orange_money: number; cash: number };
  already_closed: boolean;
  closing: DailyClosing | null;
};

export async function fetchClosingPreview(date: string, pointOfSaleId?: number | null) {
  const { data } = await api.get<ClosingPreview>("/reports/closings/preview/", {
    params: { date, ...(pointOfSaleId ? { point_of_sale: pointOfSaleId } : {}) },
  });
  return data;
}

export async function fetchClosings(pointOfSaleId?: number | null) {
  const { data } = await api.get("/reports/closings/", {
    params: { page_size: 100, ...(pointOfSaleId ? { point_of_sale: pointOfSaleId } : {}) },
  });
  return (data.results ?? data) as DailyClosing[];
}

export type ClosingInput = {
  date: string;
  point_of_sale: number | null;
  declared_card: number;
  declared_wave: number;
  declared_orange_money: number;
  declared_cash: number;
  notes: string;
};

export async function saveClosing(input: ClosingInput, existingId: number | null) {
  const { data } = existingId
    ? await api.patch<DailyClosing>(`/reports/closings/${existingId}/`, input)
    : await api.post<DailyClosing>("/reports/closings/", input);
  return data;
}

export type ProductSalesRow = {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  revenue: number;
  orders_count: number;
};

export async function fetchProductSales(start: string, end: string, pointOfSaleId?: number | null) {
  const { data } = await api.get<ProductSalesRow[]>("/reports/by-product/", {
    params: { start, end, ...(pointOfSaleId ? { point_of_sale: pointOfSaleId } : {}) },
  });
  return data;
}

export function getBrowserLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    );
  });
}

export type POSProduct = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  price: string;
  effective_price: string;
  promotion: string | null;
  stock: number;
  image: string | null;
  combo_items?: string[];
};

export type POSReceipt = {
  reference: string;
  receipt_number: string;
  created_at: string;
  point_of_sale: string;
  cashier: string;
  customer_name: string;
  table_label?: string;
  receipt_slogan?: string;
  receipt_footer?: string;
  payment_method: PaymentMethod;
  payment_method_label: string;
  pending_action?: "" | "void" | "change_payment";
  pending_payment_method?: PaymentMethod | "";
  pending_reason?: string;
  items: { name: string; quantity: number; unit_price: string; subtotal: string }[];
  total: string;
  tip_amount?: string;
  amount_received: string | null;
  change: string | null;
};

export async function cashierLogin(username: string, password: string) {
  const { data } = await api.post("/accounts/cashier-login/", { username, password });
  localStorage.setItem("lbt_cashier_token", data.access);
  localStorage.setItem("lbt_cashier_info", JSON.stringify({ username: data.username, store: data.point_of_sale_name }));
  return data as { username: string; point_of_sale_name: string };
}

export type POSSettings = {
  payment_methods: PaymentMethod[];
  modules: {
    hold: boolean;
    history: boolean;
    qr: boolean;
    dine_in: boolean;
    customer_orders: boolean;
    drawer: boolean;
    xreport: boolean;
    daily_menu: boolean;
  };
  receipt_slogan: string;
  receipt_footer: string;
  loyalty?: boolean;
};

export type POSCustomerOrder = {
  reference: string;
  full_reference?: string;
  handled?: boolean;
  received?: boolean;
  ack_status?: string;
  ack_link?: string | null;
  created_at: string;
  status: string;
  status_label: string;
  payment_reference?: string;
  ready_to_prepare?: boolean;
  discount_amount?: string;
  reward_label?: string;
  tip_amount?: string;
  loyalty?: {
    orders_count: number;
    progress: number;
    threshold: number;
    mode: "orders" | "amount";
    rewards: { id: number; label: string }[];
  } | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  maps_url: string | null;
  payment_method_label: string;
  total: string;
  items: { name: string; quantity: number }[];
};

export type DrawerOpening = { id: number; reason: string; cashier: string | null; created_at: string };

export async function fetchPOSCustomerOrders() {
  return (await api.get<POSCustomerOrder[]>("/pos/customer-orders/")).data;
}
export type PendingOnlineOrders = {
  count: number; // commandes a finaliser
  new_count: number; // dont reception pas encore confirmee (alerte rouge + son)
  orders: { reference: string; customer_name: string; total: string; created_at: string; state: string; received?: boolean }[];
};
export type AckMessage = { reference: string; full_reference?: string; customer_name: string; status: string; link: string | null };
export async function markAckSent(fullReference: string) {
  await api.post(`/pos/customer-orders/${fullReference}/ack-sent/`);
}
export async function acknowledgeOnlineOrders() {
  return (await api.post<{ acknowledged: number; messages: AckMessage[] }>("/pos/customer-orders/acknowledge/")).data;
}
export async function fetchPendingOnlineOrders() {
  return (await api.get<PendingOnlineOrders>("/pos/customer-orders/pending/")).data;
}
export async function finalizeOnlineOrder(fullReference: string) {
  await api.post(`/pos/customer-orders/${fullReference}/finalize/`);
}
export async function fetchDrawerOpenings() {
  return (await api.get<DrawerOpening[]>("/pos/drawer/")).data;
}
export async function recordDrawerOpening(reason: string) {
  return (await api.post<DrawerOpening>("/pos/drawer/", { reason })).data;
}

export async function fetchPOSProducts(search: string) {
  const { data } = await api.get<{
    point_of_sale: string;
    results: POSProduct[];
    categories: { name: string; label?: string; order: number }[];
    daily_menu?: { lunch: { product: number; number: number }[]; special: { product: number; number: number }[] };
    settings: POSSettings;
  }>("/pos/products/", {
    params: search ? { search } : {},
  });
  return data;
}

export async function fetchPOSSalesToday() {
  const { data } = await api.get<POSReceipt[]>("/pos/sales/");
  return data;
}

export async function createPOSSale(input: {
  items: { product: number; quantity: number }[];
  payment_method: PaymentMethod;
  customer_name?: string;
  amount_received?: number | null;
  table_label?: string;
  customer_phone?: string;
  tip_amount?: number;
}) {
  const { data } = await api.post<POSReceipt>("/pos/sales/", input);
  return data;
}

export type Cashier = {
  id: number;
  username: string;
  point_of_sale: number;
  point_of_sale_name: string;
  is_active: boolean;
};

export async function fetchCashiers() {
  const { data } = await api.get("/accounts/cashiers/", { params: { page_size: 100 } });
  return (data.results ?? data) as Cashier[];
}

export async function createCashier(input: { username: string; password: string; point_of_sale: number }) {
  const { data } = await api.post<Cashier>("/accounts/cashiers/", input);
  return data;
}

export async function updateCashier(id: number, input: Record<string, unknown>) {
  const { data } = await api.patch<Cashier>(`/accounts/cashiers/${id}/`, input);
  return data;
}

export type CashierClosingState = {
  date: string;
  point_of_sale: string;
  closed: boolean;
  sales_count: number;
  expected: { cash: number; wave: number; orange_money: number; card: number };
  carried_over_since: string | null;
  opening_cash: number | null;
  closing: DailyClosing | null;
};

export async function fetchCashierClosing() {
  const { data } = await api.get<CashierClosingState>("/pos/closing/");
  return data;
}

export type CashierOpeningState = {
  date: string;
  point_of_sale: string;
  opened: boolean;
  opening_cash: number | null;
};

export async function fetchCashierOpening() {
  const { data } = await api.get<CashierOpeningState>("/pos/opening/");
  return data;
}

export async function submitCashierOpening(input: { opening_cash: number; notes?: string }) {
  const { data } = await api.post<{ opening_cash: number; created: boolean }>("/pos/opening/", input);
  return data;
}

export async function openCashierAdmin(input: { date: string; cashier: number; opening_cash: number; notes?: string }) {
  const { data } = await api.post("/reports/closings/open-cashier/", input);
  return data;
}

export async function submitCashierClosing(input: {
  declared_cash: number;
  declared_wave: number;
  declared_orange_money: number;
  declared_card: number;
  notes: string;
}) {
  const { data } = await api.post<DailyClosing>("/pos/closing/", input);
  return data;
}

export async function deleteClosing(id: number) {
  await api.delete(`/reports/closings/${id}/`);
}
