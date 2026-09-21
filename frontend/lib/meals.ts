/** Un « repas » (plat) pour le menu du jour : on exclut boissons, jus, desserts, patisseries, livraison, cafe et the. */
const NOT_MEAL = /boisson|jus\b|jus de|dessert|patisserie|pâtisserie|livraison|caf[eé]\b|th[eé]\b|g[aâ]teau|cr[eê]pe|glace|soda|eau\b|bissap|gingembre|bouye|lait\b/i;

export function isMeal(name: string, category?: string | null): boolean {
  return !NOT_MEAL.test(category ?? "") && !NOT_MEAL.test(name);
}
