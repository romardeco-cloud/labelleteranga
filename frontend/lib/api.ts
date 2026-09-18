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

export async function createCheckoutSession(customer: {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  delivery_address?: string;
}) {
  const { data } = await api.post("/payments/create-checkout-session/", {
    session_key: getSessionKey(),
    ...customer,
  });
  return data as { checkout_url: string; order_reference: string };
}
