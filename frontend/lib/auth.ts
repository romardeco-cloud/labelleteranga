import { api } from "./api";

const TOKEN_KEY = "lbt_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Simple indicateur « administrateur connecte » (aucun mot de passe ni jeton) partage avec les sites publics du domaine :
// il sert uniquement a afficher le lien « Espace pro » a l'administrateur, jamais aux clients.
const STAFF_COOKIE = "lbt_staff";
const onOfficialDomain = () => /(^|\.)labelleteranga\.com$/i.test(window.location.hostname);

function setStaffFlag(on: boolean) {
  const domain = onOfficialDomain() ? "; domain=.labelleteranga.com; secure" : "";
  document.cookie = `${STAFF_COOKIE}=${on ? "1" : ""}; path=/; max-age=${on ? 8 * 3600 : 0}; samesite=lax${domain}`;
}

export function isStaffFlagged(): boolean {
  if (typeof window === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === `${STAFF_COOKIE}=1`) || !!localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  setStaffFlag(true);
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
  setStaffFlag(false);
}

export async function adminLogin(username: string, password: string) {
  const { data } = await api.post("/accounts/login/", { username, password });
  setAdminToken(data.access);
  return data;
}
