# La Belle Teranga — Supermarche en ligne

Stack: **Django + DRF** (backend/API) · **Next.js 14** (frontend) · **PostgreSQL** · **Stripe** · deploiement **Render** (API) + **Vercel** (frontend), domaine `labelleteranga.com`.

## Structure

```
labelleteranga/
  backend/    Django REST API (produits, panier, commandes, paiements, rapports)
  frontend/   Next.js (boutique publique + dashboard admin)
```

## Fonctionnalites

- Catalogue produits avec categories, stock, prix, recherche
- Panier (session anonyme via cle stockee cote navigateur)
- Paiement Stripe Checkout (commande creee puis session Stripe ; webhook confirme le paiement)
- Dashboard admin (JWT) :
  - Ventes du jour / mois / mois precedent / annee
  - Graphiques ventes journalieres (30j), mensuelles (annee), 6 derniers mois glissants, annuelles
  - Gestion des produits (creation, suppression)
  - **Import et export Excel des produits** (colonnes: sku, name, category, price, compare_at_price, stock_quantity, unit, description, is_active)
  - Liste des commandes
- Django admin natif egalement utilisable (`/admin/`), avec import/export Excel integre sur la page Produits.

## Demarrage local

### 1. Backend (Django)

```bash
cd labelleteranga/backend
python -m venv venv
venv\Scripts\activate      # sous Windows PowerShell: venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env     # puis completer les valeurs (cle Stripe, DB, etc.)
```

Creer la base Postgres locale (ou utiliser Docker) puis :

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

L'API tourne sur `http://localhost:8000`. Admin Django: `http://localhost:8000/admin/`.

### 2. Frontend (Next.js)

```bash
cd labelleteranga/frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Le site tourne sur `http://localhost:3000`, le dashboard admin sur `http://localhost:3000/admin` (se connecter avec un compte Django `is_staff=True`).

### 3. Webhook Stripe en local

```bash
stripe listen --forward-to localhost:8000/api/payments/webhook/
```

Copier le `whsec_...` affiche dans `STRIPE_WEBHOOK_SECRET` du fichier `.env` backend.

## Import Excel des produits

Format attendu (`.xlsx`), premiere ligne = en-tetes :

| sku | name | category | price | compare_at_price | stock_quantity | unit | description | is_active |
|-----|------|----------|-------|-------------------|-----------------|------|--------------|-----------|

`sku` sert de cle : une ligne avec un sku existant met a jour le produit, sinon il est cree. La categorie est creee automatiquement si elle n'existe pas.

## Rapports de ventes

Endpoints (reserves admin, JWT requis) :

- `GET /api/reports/summary/` — chiffres cles (aujourd'hui, ce mois, mois precedent, cette annee)
- `GET /api/reports/daily/?days=30`
- `GET /api/reports/monthly/?year=2026`
- `GET /api/reports/yearly/`
- `GET /api/reports/previous-months/?count=6`

Tous se basent sur les commandes au statut `paid` (confirmees par le webhook Stripe).

## Deploiement

### Backend sur Render

Le fichier [`backend/render.yaml`](backend/render.yaml) definit un Blueprint Render (service web + base Postgres). Sur Render :

1. "New +" → "Blueprint" → pointer vers ce repo.
2. Renseigner les variables secretes non generees automatiquement : `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
3. Une fois deploye, configurer un sous-domaine `api.labelleteranga.com` pointant vers le service Render (CNAME).
4. Dans le dashboard Stripe, ajouter l'endpoint webhook `https://api.labelleteranga.com/api/payments/webhook/`.

### Frontend sur Vercel

1. Importer le dossier `frontend/` comme projet Vercel.
2. Variable d'environnement : `NEXT_PUBLIC_API_URL=https://api.labelleteranga.com/api`.
3. Domaine personnalise : ajouter `labelleteranga.com` et `www.labelleteranga.com` dans les parametres Vercel, puis mettre a jour les DNS chez votre registrar (A/CNAME selon les instructions Vercel).

### DNS (chez le registrar de labelleteranga.com)

- `labelleteranga.com` / `www` → Vercel (voir instructions exactes dans Vercel > Domains)
- `api.labelleteranga.com` → CNAME vers le service Render

## Note importante sur Stripe au Senegal

Stripe ne permet pas aujourd'hui la creation directe d'un compte marchand avec une entite basee au Senegal (le pays n'est pas dans la liste des pays supportes pour l'onboarding "Stripe Connect/Standard"). En pratique, pour utiliser Stripe depuis le Senegal, il faut generalement :

- une entite/societe enregistree dans un pays supporte par Stripe (ex. France, Etats-Unis, etc.), ou
- passer par un partenaire/PSP local (Wave, Orange Money, PayDunya, CinetPay, Paystack...) qui gerent nativement le marche senegalais.

Le code fourni est fonctionnel avec n'importe quel compte Stripe valide (cles `sk_test_...` / `sk_live_...`) et utilise la devise `XOF`. Si vous n'avez pas encore de compte Stripe utilisable au Senegal, ce projet peut etre adapte pour un agregateur local (CinetPay/PayDunya) en remplacant `apps/payments/views.py` — demandez si vous voulez cette variante.

## Prochaines etapes suggerees

- Ajouter la gestion des images produits multiples et upload direct depuis l'admin Next.js
- Emails de confirmation de commande (ex. via SendGrid/Mailjet)
- Pagination/filtrage avance du catalogue cote frontend
- Tests automatises (pytest-django, Playwright)
