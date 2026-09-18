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
  categories?: SiteCategory[];
};

/** Nom court d'un site : "Resto & Fast-food La Belle Teranga" -> "Resto & Fast-food". */
export const shortName = (name: string) => name.replace(/ La Belle Teranga$/i, "");

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
export function siteUrl(slug: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  return root ? `https://${slug}.${root}` : `/s/${slug}`;
}

/** Icones d'application (PWA) par site ; les sites sans logo propre utilisent le logo principal. */
export const iconSet = (slug: string) => (["supermarche", "resto"].includes(slug) ? slug : "main");
