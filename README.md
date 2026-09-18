# La Belle Teranga — Supermarche en ligne

Stack: **Django + DRF** (backend/API) · **Next.js 16** (frontend) · **PostgreSQL** · **Stripe / Wave / Orange Money / Especes** · confirmation **WhatsApp** · deploiement **Render** (API) + **Vercel** (frontend), domaine `labelleteranga.com`.

## Structure

```
labelleteranga/
  backend/    Django REST API (produits, panier, commandes, paiements, rapports)
  frontend/   Next.js (boutique publique + dashboard admin)
```

## Fonctionnalites

- Catalogue produits avec categories, stock, prix, recherche
- Panier (session anonyme via cle stockee cote navigateur)
- 4 moyens de paiement au choix du client : **carte bancaire (Stripe)**, **Wave**, **Orange Money**, **especes a la livraison**
- Geolocalisation optionnelle du client au checkout (bouton "Partager ma position GPS"), incluse dans l'adresse de livraison
- **Confirmation de commande par WhatsApp**, envoyee uniquement une fois le paiement reellement confirme (webhook Stripe/Wave/Orange Money, ou validation manuelle admin pour les commandes especes) — voir [Confirmation WhatsApp](#confirmation-whatsapp) ci-dessous
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

Tous se basent sur les commandes au statut `paid`.

## Confirmation WhatsApp

Des qu'une commande passe au statut `paid` (quelle que soit la methode de paiement), `apps/orders/services.mark_order_paid()` est le point d'entree unique qui declenche `apps/notifications/whatsapp.py`. Le message inclut le recapitulatif de commande, le moyen de paiement, l'adresse de livraison et, si le client a partage sa position, un lien Google Maps.

Deux niveaux, cumulables :

1. **Lien wa.me (par defaut, aucune configuration requise)** : un lien pre-rempli s'ouvre dans WhatsApp. Sur la page de confirmation client, le bouton "Confirmer par WhatsApp" envoie le message a la boutique ; dans le dashboard admin (page Commandes), le bouton "Confirmer WhatsApp" envoie le message au client. Fonctionne immediatement mais demande un clic.
2. **Envoi automatique via l'API WhatsApp Cloud (Meta)** — optionnel, active en renseignant `WHATSAPP_ACCESS_TOKEN` et `WHATSAPP_PHONE_NUMBER_ID`. **Attention** : Meta exige un compte WhatsApp Business verifie, et un message envoye a l'initiative de l'entreprise (hors fenetre de conversation client de 24h) doit normalement utiliser un modele pre-approuve — un texte libre peut etre refuse par l'API. Cette voie est fournie mais n'a pas pu etre testee en conditions reelles (aucun compte Meta Business disponible) ; le lien wa.me reste donc la methode fiable par defaut.

Pour les commandes especes, la confirmation n'est envoyee qu'au moment ou l'admin clique sur "Marquer payee" dans le dashboard (`/admin/orders`) — c'est-a-dire au moment de la livraison, quand le paiement est reellement recu.

## Wave et Orange Money — statut de l'integration

`apps/payments/wave.py` et `apps/payments/orange_money.py` sont codes d'apres la documentation publique de chaque prestataire (Wave for Business Checkout et Orange Money Web Payment), mais **n'ont pas pu etre testes contre un sandbox reel** (aucun compte marchand Wave/Orange fourni). Avant mise en production :

- Wave : creer un compte [Wave for Business](https://www.wave.com/fr/business), recuperer la cle API et la renseigner dans `WAVE_API_KEY` ; verifier le format exact de la reponse `create_checkout_session` et implementer `verify_webhook_signature()` avec le secret fourni par Wave.
- Orange Money : creer un compte marchand sur le [Orange Developer Center](https://developer.orange.com/apis/om-webpay), recuperer `client_id`/`client_secret`/`merchant_key` et les renseigner dans les variables correspondantes ; verifier le code devise attendu par votre contrat (XOF ISO vs code sandbox specifique).

## Deploiement

### Backend sur Render

Le fichier [`backend/render.yaml`](backend/render.yaml) definit un Blueprint Render (service web + base Postgres). Sur Render :

1. "New +" → "Blueprint" → pointer vers ce repo.
2. Renseigner les variables secretes non generees automatiquement : `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, et si utilises `WAVE_API_KEY`, `ORANGE_MONEY_CLIENT_ID`/`_SECRET`/`_MERCHANT_KEY`, `WHATSAPP_ACCESS_TOKEN`/`_PHONE_NUMBER_ID`, `WHATSAPP_SHOP_NUMBER`.
3. Une fois deploye, configurer un sous-domaine `api.labelleteranga.com` pointant vers le service Render (CNAME).
4. Ajouter les endpoints webhook chez chaque prestataire : Stripe → `https://api.labelleteranga.com/api/payments/webhook/`, Wave → `.../api/payments/wave/webhook/`, Orange Money (notif_url) → `.../api/payments/orange-money/webhook/`.

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

Le code fourni est fonctionnel avec n'importe quel compte Stripe valide (cles `sk_test_...` / `sk_live_...`) et utilise la devise `XOF`. C'est pour cette raison que Wave, Orange Money et le paiement especes sont proposes en complement (ou remplacement) de la carte bancaire — voir la section [Wave et Orange Money](#wave-et-orange-money--statut-de-lintegration) ci-dessus.

## Prochaines etapes suggerees

- Ajouter la gestion des images produits multiples et upload direct depuis l'admin Next.js
- Emails de confirmation de commande (ex. via SendGrid/Mailjet)
- Pagination/filtrage avance du catalogue cote frontend
- Tests automatises (pytest-django, Playwright)
- Tester Wave et Orange Money en sandbox reel et implementer la verification de signature des webhooks
- Modele de message WhatsApp Cloud API pre-approuve, pour un envoi automatique fiable hors fenetre de conversation 24h
