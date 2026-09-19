import { API_URL } from "./api";

export type SiteCategory = { id: number; name: string; order: number; products_count: number };

export type Site = {
  id: number;
  name: string;
  slug: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  payment_methods: ("cash" | "wave" | "orange_money" | "card")[];
  manual_payment_methods: ("wave" | "orange_money")[];
  wave_pay_url?: string;
  orange_pay_url?: string;
  wave_number?: string;
  orange_number?: string;
  categories?: SiteCategory[];
  social_links?: Partial<Record<"whatsapp" | "phone" | "facebook" | "instagram" | "tiktok" | "x" | "youtube" | "telegram" | "website", string>>;
  loyalty?: { enabled: boolean; mode?: "orders" | "amount"; threshold?: number; reward_label?: string };
  reviews?: { count: number; overall: number | null };
  combos_count?: number;
  rccm?: string;
  ninea?: string;
};

/** Nom court d'un site : "Resto & Fast-food La Belle Teranga" -> "Resto & Fast-food". */
export const shortName = (name: string) => name.replace(/ La Belle Teranga$/i, "");

/**
 * Lien de paiement marchand du point de vente pour ce moyen de paiement, avec le montant pre-rempli quand
 * l'application le permet (Wave : parametre amount). Ouvre directement Wave / Orange Money / Max it sur mobile.
 */
export function merchantPayLink(site: Site, method: "wave" | "orange_money", amount: number): string | null {
  const raw = method === "wave" ? site.wave_pay_url : site.orange_pay_url;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (method === "wave") url.searchParams.set("amount", String(Math.round(amount)));
    return url.toString();
  } catch {
    return null;
  }
}

/** Domaine officiel et points de vente qui ont leur propre sous-domaine (resto.labelleteranga.com...). */
export const ROOT_URL = "https://labelleteranga.com";
export const SUBDOMAIN_SITES = ["resto", "supermarche", "quincaillerie", "depot"];

/** Adresse publique definitive d'un site (utilisee pour les QR codes, affiches et liens a partager). */
export function siteUrl(site: Pick<Site, "slug">): string {
  return SUBDOMAIN_SITES.includes(site.slug) ? `https://${site.slug}.labelleteranga.com` : `${ROOT_URL}/s/${site.slug}`;
}

/** Adresse sans "https://" pour l'affichage (affiches, cartes). */
export const displayUrl = (site: Pick<Site, "slug">) => siteUrl(site).replace(/^https?:\/\//, "");

/** Adresse unique de contact pour tous les points de vente. */
export const CONTACT_EMAIL = "info@labelleteranga.com";

export async function fetchSites(): Promise<Site[]> {
  try {
    const res = await fetch(`${API_URL}/stores/sites/`, { next: { revalidate: 60 } });
    return res.ok ? res.json() : [];
  } catch {
    return [];
  }
}

export async function fetchSite(slug: string): Promise<Site | null> {
  try {
    const res = await fetch(`${API_URL}/stores/sites/${slug}/`, { next: { revalidate: 60 } });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

// Site actif cote navigateur : chaque site a son propre panier (cle de session distincte).
let activeStore: string | null = null;
export const setActiveStore = (slug: string | null) => {
  activeStore = slug;
};
export const getActiveStore = () => activeStore;

/** Adresse publique d'un site : sous-domaine si NEXT_PUBLIC_ROOT_DOMAIN est defini, sinon /s/<slug>. */
export function siteHref(slug: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  return root ? `https://${slug}.${root}` : `/s/${slug}`;
}

/** Icones d'application (PWA) par site ; les sites sans logo propre utilisent le logo principal. */
export const iconSet = (slug: string) => (["supermarche", "resto"].includes(slug) ? slug : "main");

export type SiteDailyMenus = {
  lunch: import("./store-admin").DailyMenu | null;
  special: import("./store-admin").DailyMenu | null;
};

export async function fetchSiteMenus(slug: string): Promise<SiteDailyMenus> {
  try {
    const res = await fetch(`${API_URL}/stores/sites/${slug}/menu/`, { cache: "no-store" });
    return res.ok ? res.json() : { lunch: null, special: null };
  } catch {
    return { lunch: null, special: null };
  }
}
