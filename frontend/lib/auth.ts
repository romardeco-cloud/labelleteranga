import { api } from "./api";

const TOKEN_KEY = "lbt_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function adminLogin(username: string, password: string) {
  const { data } = await api.post("/accounts/login/", { username, password });
  setAdminToken(data.access);
  return data;
}
