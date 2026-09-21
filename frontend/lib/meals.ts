/** Categories proposees pour le menu du jour et le menu du midi (le reste reste accessible avec la case « tout afficher »). */
const MENU_CATEGORIES = ["plats senegalais", "burgers et sandwichs", "snacks et accompagnements", "boissons et jus"];

const clean = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Ordre d'affichage des categories dans le choix des plats (les autres categories suivent, par ordre alphabetique). */
export function categoryRank(category?: string | null): number {
  const i = MENU_CATEGORIES.indexOf(clean(category ?? ""));
  return i === -1 ? MENU_CATEGORIES.length : i;
}

const KEY = "lbt_menu_categories";

/** Categories choisies pour l'affichage du choix des plats (memorisees sur cet appareil) ; null = choix par defaut. */
export function loadMenuCategories(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

export function saveMenuCategories(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

/** Categories a afficher : le choix memorise, sinon les 4 categories du menu (parmi celles qui existent). */
export function effectiveCategories(all: string[], chosen: string[] | null): string[] {
  const base = chosen ?? all.filter((c) => MENU_CATEGORIES.includes(clean(c)));
  return base.filter((c) => all.includes(c));
}

export function isMeal(_name: string, category?: string | null): boolean {
  return !!category && MENU_CATEGORIES.includes(clean(category));
}
