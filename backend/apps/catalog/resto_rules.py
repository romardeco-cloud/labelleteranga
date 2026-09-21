"""Classement des plats du restaurant / fast-food par categorie, d'apres le nom du plat (sans dependance aux modeles : utilisable dans une migration)."""

import re
import unicodedata

COMBOS = "Combos"
SENEGALAIS = "Plats sénégalais"
POULET = "Poulet et grillades"
BURGERS = "Burgers et sandwichs"
PIZZAS = "Pizzas"
SNACKS = "Snacks et accompagnements"
DESSERTS = "Desserts et pâtisseries"
BOISSONS = "Boissons et jus"
PETIT_DEJ = "Petit-déjeuner"
LIVRAISON = "Livraison"

# ordre d'affichage des filtres sur le site et a la caisse
ORDER = [COMBOS, SENEGALAIS, POULET, PIZZAS, BURGERS, SNACKS, DESSERTS, BOISSONS, PETIT_DEJ, LIVRAISON]

# (categorie, mots-cles) : la premiere regle qui correspond gagne
RULES = [
    (LIVRAISON, r"livraison"),
    (COMBOS, r"combo|formule|menu (famille|enfant|duo|midi|special)|pack|plateau"),
    (PIZZAS, r"pizza|calzone"),
    (PETIT_DEJ, r"petit dej"),
    (DESSERTS, r"gateau|crepe|dessert|glace|patisserie|tarte|cake|muffin|donut|yaourt|thiakry|cookie|brownie|salade de fruits"),
    (BOISSONS, r"jus|boisson|eau|soda|coca|fanta|sprite|the|cafe|nescafe|gingembre|bissap|bouye|lait|smoothie|cocktail|limonade|cappuccino|infusion|tea"),
    (SENEGALAIS, r"thieb\w*|thiep\w*|thiou\w*|yassa|mafe|maafe|domoda|etodjey|caldou|kandia|kandja|kandje|soupe|soupou|dibi|lakh|ndambe|fonio|riz|couscous|dakhine|sombi|bassi"),
    (BURGERS, r"burger\w*|sandwich\w*|tacos|chawarma\w*|shawarma\w*|panini|hot dog|hotdog|wrap|croque\w*|kebab|norvegien"),
    (POULET, r"poulet\w*|braise\w*|frit|frits|grille\w*|brochette\w*|ailes?|tenders?|nuggets?|quart|demi|dinde|viande|agneau|mouton|merguez|saucisse\w*|poisson|steak"),
    (SNACKS, r"fataya\w*|pastel\w*|nems?|samoussa\w*|beignet\w*|accra|frites?|poutine|salade\w*|croquette\w*|pop corn|popcorn|chips|omelette|acheke|attieke"),
]
_COMPILED = [(cat, re.compile(r"(?<![a-z0-9])(?:" + pattern + r")(?![a-z0-9])")) for cat, pattern in RULES]


def _clean(name):
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def guess_resto_category(name):
    """Categorie du restaurant d'apres le nom du plat, ou None si aucun mot-cle ne correspond."""
    text = _clean(name)
    for category, rx in _COMPILED:
        if rx.search(text):
            return category
    return None
