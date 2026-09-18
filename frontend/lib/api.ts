import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("lbt_admin_token");
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

export type Product = {
  id: number;
  sku: string;
  name: string;
  slug: string;
  description: string;
  category: Category | null;
  price: string;
  compare_at_price: string | null;
  stock_quantity: number;
  unit: string;
  image: string | null;
  is_active: boolean;
  in_stock: boolean;
};

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

export function getSessionKey(): string {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem("lbt_cart_session");
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem("lbt_cart_session", key);
  }
  return key;
}

export async function fetchProducts(params: Record<string, string> = {}) {
  const { data } = await api.get("/catalog/products/", { params });
  return data;
}

export async function fetchCart() {
  const { data } = await api.get<CartData>(`/cart/${getSessionKey()}/`);
  return data;
}

export async function addToCart(productId: number, quantity = 1) {
  const { data } = await api.post<CartData>(`/cart/${getSessionKey()}/add/`, {
    product_id: productId,
    quantity,
  });
  return data;
}

export async function updateCartItem(itemId: number, quantity: number) {
  const { data } = await api.patch<CartData>(`/cart/${getSessionKey()}/items/${itemId}/`, { quantity });
  return data;
}

export async function removeCartItem(itemId: number) {
  const { data } = await api.delete<CartData>(`/cart/${getSessionKey()}/items/${itemId}/`);
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
};

export type Order = {
  id: number;
  reference: string;
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
  items: CartItem[];
  created_at: string;
  paid_at: string | null;
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

export type PaymentBreakdownRow = {
  payment_method: PaymentMethod;
  revenue: number;
  orders_count: number;
};

export async function fetchPaymentBreakdown(period: "today" | "month" | "year") {
  const { data } = await api.get<PaymentBreakdownRow[]>("/reports/by-payment-method/", { params: { period } });
  return data;
}

export type DailyClosing = {
  id: number;
  date: string;
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
};

export type ClosingPreview = {
  date: string;
  expected: { card: number; wave: number; orange_money: number; cash: number };
  already_closed: boolean;
  closing: DailyClosing | null;
};

export async function fetchClosingPreview(date: string) {
  const { data } = await api.get<ClosingPreview>("/reports/closings/preview/", { params: { date } });
  return data;
}

export async function fetchClosings() {
  const { data } = await api.get("/reports/closings/", { params: { page_size: 100 } });
  return (data.results ?? data) as DailyClosing[];
}

export type ClosingInput = {
  date: string;
  declared_card: number;
  declared_wave: number;
  declared_orange_money: number;
  declared_cash: number;
  notes: string;
};

export async function saveClosing(input: ClosingInput, isUpdate: boolean) {
  const { data } = isUpdate
    ? await api.patch<DailyClosing>(`/reports/closings/${input.date}/`, input)
    : await api.post<DailyClosing>("/reports/closings/", input);
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
