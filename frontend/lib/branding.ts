// Visuels "vitrine" par point de vente et illustrations de repli pour les produits sans photo.

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const STORE_IMAGES: [string, string][] = [
  ["resto", "/stores/resto-fastfood.jpg"],
  ["fast", "/stores/resto-fastfood.jpg"],
  ["forage", "/stores/forage.jpg"],
  ["supermarche", "/stores/supermarche.jpg"],
];

/** Image vitrine d'un point de vente (logo principal si aucune image dediee). */
export function storeImage(name: string | null | undefined): string {
  const n = norm(name ?? "");
  return STORE_IMAGES.find(([key]) => n.includes(key))?.[1] ?? "/logo.jpg";
}

export function hasStoreImage(name: string | null | undefined): boolean {
  return storeImage(name) !== "/logo.jpg";
}

export const PAYMENT_QR: Record<string, { src: string; alt: string; width: number; height: number }> = {
  wave: { src: "/payments/wave-qr.jpg", alt: "QR code Wave", width: 522, height: 744 },
  orange_money: { src: "/payments/orange-money-qr.jpg", alt: "QR code Orange Money", width: 700, height: 396 },
};

// Mots-cles (sans accents) -> emoji. Le premier qui correspond gagne : du plus precis au plus general.
const PRODUCT_EMOJI: [string[], string][] = [
  [["biberon", "petits pots", "infantile"], "🍼"],
  [["shampoing", "gel douche", "deodorant", "creme hydratante", "huile capillaire", "gel coiffant", "creme capillaire"], "🧴"],
  [["javel", "desinfectant", "detergent"], "🧴"],
  [["fromage", "camembert", "mozzarella", "emmental", "gouda", "cheddar", "degue"], "🧀"],
  [["yaourt"], "🥛"],
  [["lait"], "🥛"],
  [["beurre"], "🧈"],
  [["creme glacee", "glace"], "🍨"],
  [["creme"], "🥣"],
  [["croissant"], "🥐"],
  [["baguette", "pain"], "🥖"],
  [["gateau"], "🎂"],
  [["beignet"], "🍩"],
  [["biscuit"], "🍪"],
  [["chocolat"], "🍫"],
  [["bonbon", "chewing"], "🍬"],
  [["miel"], "🍯"],
  [["confiture"], "🍓"],
  [["cereales petit"], "🥣"],
  [["riz"], "🍚"],
  [["pate"], "🍝"],
  [["huile"], "🫒"],
  [["sucre", "farine", "fonio", "mil", "sorgho", "mais", "couscous"], "🌾"],
  [["sel de", "poivre", "piment"], "🌶️"],
  [["tomate", "concentre"], "🍅"],
  [["sardine", "thon en conserve", "haricots en conserve"], "🥫"],
  [["cube", "sauce", "vinaigre"], "🥫"],
  [["niebe", "haricot"], "🫘"],
  [["eau"], "💧"],
  [["jus", "bissap", "bouye"], "🧃"],
  [["soda", "boisson"], "🥤"],
  [["biere"], "🍺"],
  [["vin"], "🍷"],
  [["cafe", "the "], "☕"],
  [["mangue"], "🥭"],
  [["banane"], "🍌"],
  [["orange", "citron"], "🍊"],
  [["pasteque"], "🍉"],
  [["oignon", "ail"], "🧅"],
  [["pomme de terre", "frites"], "🥔"],
  [["chou"], "🥬"],
  [["carotte"], "🥕"],
  [["aubergine"], "🍆"],
  [["gombo", "legume"], "🥦"],
  [["poulet", "dinde", "decoupes"], "🍗"],
  [["merguez", "saucisse"], "🌭"],
  [["viande", "boeuf", "mouton"], "🥩"],
  [["crevette"], "🦐"],
  [["poisson", "thiof", "thon", "capitaine", "yaboy", "kethiakh", "guedj"], "🐟"],
  [["savon"], "🧼"],
  [["dentifrice", "brosse a dents"], "🪥"],
  [["rasoir"], "🪒"],
  [["coton"], "🧻"],
  [["papier toilette", "essuie"], "🧻"],
  [["eponge"], "🧽"],
  [["poubelle"], "🗑️"],
  [["couche", "lingette"], "👶"],
  [["cahier"], "📓"],
  [["stylo", "crayon"], "✏️"],
  [["papier", "ramette", "classeur"], "📄"],
  [["calculatrice"], "🧮"],
  [["cartable"], "🎒"],
  [["croquette", "litiere", "laisse"], "🐾"],
  [["t-shirt", "boubou", "sous-vetement", "pagne", "bazin"], "👕"],
  [["chaussure"], "👟"],
  [["voile", "hijab"], "🧕"],
  [["tapis de priere", "chapelet", "encens"], "🕌"],
  [["refrigerateur", "climatiseur"], "🧊"],
  [["ventilateur"], "🌀"],
  [["mixeur", "bouilloire", "fer a repasser"], "🔌"],
  [["ampoule"], "💡"],
  [["pile"], "🔋"],
  [["peinture"], "🎨"],
  [["outil", "marteau"], "🔧"],
  [["cadenas"], "🔒"],
  [["rallonge"], "🔌"],
  [["meche", "perruque", "defrisant"], "💇"],
];

const CATEGORY_EMOJI: [string, string][] = [
  ["fruits", "🍎"],
  ["charcuterie", "🌭"],
  ["fromagerie", "🧀"],
  ["patisserie", "🥐"],
  ["gateau", "🎂"],
  ["secs", "🌾"],
  ["laitiers", "🥛"],
  ["liquides", "🥤"],
  ["hygiene", "🧴"],
  ["papeterie", "✏️"],
  ["bebe", "🍼"],
  ["restauration", "🍔"],
];

export function productEmoji(name: string, category?: string | null): string {
  const n = " " + norm(name) + " ";
  for (const [keys, emoji] of PRODUCT_EMOJI) {
    if (keys.some((k) => (k.includes(" ") ? n.includes(k) : new RegExp(`\\b${k}`).test(n)))) return emoji;
  }
  const c = norm(category ?? "");
  return CATEGORY_EMOJI.find(([k]) => c.includes(k))?.[1] ?? "🛒";
}

const EXTRA_CATEGORY_EMOJI: [string, string][] = [
  ["boisson", "🥤"],
  ["boucherie", "🥩"],
  ["poisson", "🐟"],
  ["surgel", "🧊"],
  ["textile", "👕"],
  ["electromenager", "🔌"],
  ["quincaillerie", "🔧"],
  ["animaux", "🐾"],
  ["halal", "🕌"],
  ["entretien", "🧽"],
  ["cereales", "🌾"],
  ["epicerie", "🥫"],
];

/** Petite icone pour une puce de categorie (caisse). */
export function categoryEmoji(name: string): string {
  const c = norm(name);
  return (
    CATEGORY_EMOJI.find(([k]) => c.includes(k))?.[1] ?? EXTRA_CATEGORY_EMOJI.find(([k]) => c.includes(k))?.[1] ?? "🛒"
  );
}
