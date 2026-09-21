/** Categories proposees pour le menu du jour et le menu du midi (le reste reste accessible avec la case « tout afficher »). */
const MENU_CATEGORIES = ["plats senegalais", "burgers et sandwichs", "snacks et accompagnements", "boissons et jus"];

const clean = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function isMeal(_name: string, category?: string | null): boolean {
  return !!category && MENU_CATEGORIES.includes(clean(category));
}
