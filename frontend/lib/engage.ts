import { api } from "./api";

/* ---------- Echelle de notation ---------- */
export const RATING_LABELS: Record<number, string> = { 1: "Pas satisfait", 2: "Moyen", 3: "Bon", 4: "Tres bon", 5: "Excellent" };

/* ---------- Avis ---------- */
export type ReviewSummary = {
  count: number;
  service: number | null;
  quality: number | null;
  overall: number | null;
  speed: number | null;
  welcome: number | null;
  distribution: Record<string, number>;
  recommend: { yes: number; maybe: number; no: number };
};
export type PublicReview = {
  id: number;
  name: string;
  service_rating: number;
  quality_rating: number;
  dish: string;
  comment: string;
  reply: string;
  created_at: string;
};
export type ReviewInput = {
  service_rating: number;
  quality_rating: number;
  q_speed?: number;
  q_welcome?: number;
  q_recommend?: "yes" | "maybe" | "no" | "";
  comment?: string;
  dish?: string;
  customer_name?: string;
  order?: string;
};

export async function fetchSiteReviews(slug: string) {
  return (await api.get<{ summary: ReviewSummary; reviews: PublicReview[] }>(`/stores/sites/${slug}/reviews/`)).data;
}
export async function submitReview(slug: string, input: ReviewInput) {
  return (await api.post(`/stores/sites/${slug}/reviews/`, input)).data;
}

export type AdminReview = {
  id: number;
  point_of_sale: number;
  point_of_sale_name: string;
  order_reference: string;
  customer_name: string;
  customer_phone: string;
  service_rating: number;
  quality_rating: number;
  q_speed: number | null;
  q_welcome: number | null;
  q_recommend: string;
  dish: string;
  comment: string;
  is_published: boolean;
  comment_hidden: boolean;
  reply: string;
  created_at: string;
};
export async function fetchAdminReviews(storeId?: number | null) {
  return (
    await api.get<{ summary: ReviewSummary; results: AdminReview[] }>("/stores/reviews/", {
      params: storeId ? { point_of_sale: storeId } : {},
    })
  ).data;
}
export async function updateReview(id: number, patch: { is_published?: boolean; comment_hidden?: boolean; reply?: string }) {
  return (await api.patch<AdminReview>(`/stores/reviews/${id}/`, patch)).data;
}
export async function deleteReview(id: number) {
  await api.delete(`/stores/reviews/${id}/`);
}

/* ---------- Fidelite ---------- */
export type LoyaltyStatus = {
  enabled: boolean;
  mode: "orders" | "amount";
  threshold: number;
  reward_label: string;
  reward_type: "percent" | "amount" | "gift";
  reward_value: number;
  member: null | {
    name: string;
    orders_count: number;
    progress: number;
    rewards: { id: number; code?: string; label: string; expires_at: string | null }[];
  };
};
export async function fetchLoyalty(slug: string, phone: string) {
  return (await api.get<LoyaltyStatus>(`/stores/sites/${slug}/loyalty/`, { params: { phone } })).data;
}
export async function fetchPosLoyalty(phone: string) {
  return (await api.get<LoyaltyStatus>("/pos/loyalty/", { params: { phone } })).data;
}
export async function redeemPosReward(reward: number) {
  await api.post("/pos/loyalty/", { reward });
}

export type LoyaltyMemberRow = {
  id: number;
  point_of_sale: number;
  point_of_sale_name: string;
  phone: string;
  name: string;
  orders_count: number;
  total_spent: string;
  progress: string;
  rewards_earned: number;
  rewards: { id: number; code: string; label: string; expires_at: string | null }[];
};
export async function fetchLoyaltyAdmin(storeId: number | null, q: string) {
  return (
    await api.get<{
      members: LoyaltyMemberRow[];
      stats: { members: number; rewards_issued: number; rewards_used: number; rewards_pending: number };
    }>("/stores/loyalty/", { params: { ...(storeId ? { point_of_sale: storeId } : {}), q } })
  ).data;
}
export async function redeemRewardAdmin(reward: number) {
  await api.post("/stores/loyalty/", { reward });
}

/* ---------- Combos evenementiels ---------- */
export type Combo = {
  id: number;
  point_of_sale: number;
  name: string;
  occasion: string;
  description: string;
  includes: string;
  serves: string;
  price: string;
  image: string | null;
  weekend_only: boolean;
  starts_on: string | null;
  ends_on: string | null;
  min_notice_hours: number;
  is_active: boolean;
  order: number;
};
export async function fetchSiteCombos(slug: string) {
  return (await api.get<Combo[]>(`/stores/sites/${slug}/combos/`)).data;
}
export type ComboRequestInput = {
  combo: number;
  customer_name: string;
  customer_phone: string;
  event_date: string;
  guests: number;
  message?: string;
};
export async function submitComboRequest(slug: string, input: ComboRequestInput) {
  return (await api.post<{ detail: string }>(`/stores/sites/${slug}/combo-requests/`, input)).data;
}

export async function fetchCombosAdmin(storeId: number) {
  return (await api.get<Combo[]>("/stores/combos/", { params: { point_of_sale: storeId } })).data;
}
export async function saveCombo(id: number | null, form: FormData) {
  return id ? (await api.patch<Combo>(`/stores/combos/${id}/`, form)).data : (await api.post<Combo>("/stores/combos/", form)).data;
}
export async function deleteCombo(id: number) {
  await api.delete(`/stores/combos/${id}/`);
}

export type ComboRequestRow = {
  id: number;
  point_of_sale: number;
  point_of_sale_name: string;
  combo_name: string;
  combo_price: string;
  customer_name: string;
  customer_phone: string;
  event_date: string;
  guests: number;
  message: string;
  status: "new" | "confirmed" | "cancelled";
  created_at: string;
};
export async function fetchComboRequests(storeId: number | null) {
  return (await api.get<ComboRequestRow[]>("/stores/combo-requests/", { params: storeId ? { point_of_sale: storeId } : {} })).data;
}
export async function setComboRequestStatus(id: number, status: ComboRequestRow["status"]) {
  return (await api.patch<ComboRequestRow>(`/stores/combo-requests/${id}/`, { status })).data;
}
