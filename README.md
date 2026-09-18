# La Belle Teranga — Supermarche en ligne

Stack: **Django + DRF** (backend/API) · **Next.js 16** (frontend) · **PostgreSQL** · **Stripe / Wave / Orange Money / Especes** · confirmation **WhatsApp** · deploiement **Render** (API) + **Vercel** (frontend), domaine `labelleteranga.com`.

## Structure

```
labelleteranga/
  backend/    Django REST API (produits, panier, commandes, paiements, rapports)
  frontend/   Next.js (boutique publique + dashboard admin)
```

## Fonctionnalites

- **Application installable (PWA)** : sur iOS (Safari > Partager > Sur l'ecran d'accueil), Android et ordinateur (Chrome/Edge proposent automatiquement "Installer l'application"), une fois le site servi en HTTPS. Aucun compte App Store / Play Store requis. Voir [Application mobile](#application-mobile-pwa) ci-dessous.
- **Ecran de caisse (POS) `/caisse`** pour les caissiers : comptes limites rattaches a un point de vente (crees dans `/admin/cashiers`), recherche/selection des produits, paiement (especes avec calcul du rendu, Wave, Orange Money, carte), ticket imprimable. Chaque vente est enregistree deja payee, decremente le stock du point de vente du caissier, applique les promotions en cours et alimente la cloture de caisse du jour. Un caissier n'a acces ni aux rapports, ni aux prix, ni aux clotures.
- **Documents commerciaux (admin)** : devis, factures et bons de commande fournisseur avec numerotation automatique (DEV/FAC/BC-annee-numero), lignes (produit ou article libre, remise, TVA optionnelle), mode de paiement et dates, impression / export PDF depuis le navigateur. Devis -> facture en un clic ; factures avec paiements multiples (mode, date, reference), solde et retard ; sortie de stock optionnelle a l'emission ; bons de commande avec reception (partielle ou totale) qui alimente le stock du point de vente destinataire et paiements fournisseurs. Carnet clients / fournisseurs (`/admin/contacts`).
- **Centre de rapports (`/admin/reports`)** avec filtres periode + point de vente et export Excel multi-feuilles (ventes, factures, paiements, devis, bons de commande, ecarts de caisse, stock) : synthese, ventes (par mode de paiement, canal, magasin, caissier, jour, produit), encaissements tous modes, inventaire et stock faible, creances clients et dettes fournisseurs par anciennete, ecarts de caisse.
- Catalogue produits avec categories, prix, recherche
- **Plusieurs points de vente**, chacun avec son propre stock par produit (`/admin/stores`) — le stock affiche cote boutique est le total tous magasins confondus
- Panier (session anonyme via cle stockee cote navigateur)
- 4 moyens de paiement au choix du client : **carte bancaire (Stripe)**, **Wave**, **Orange Money**, **especes a la livraison**
- Geolocalisation optionnelle du client au checkout (bouton "Partager ma position GPS"), incluse dans l'adresse de livraison
- **Confirmation de commande par WhatsApp**, envoyee uniquement une fois le paiement reellement confirme (webhook Stripe/Wave/Orange Money, ou validation manuelle admin pour les commandes especes) — voir [Confirmation WhatsApp](#confirmation-whatsapp) ci-dessous
- Dashboard admin (JWT) :
  - Ventes du jour / mois / mois precedent / annee
  - Graphiques ventes journalieres (30j), mensuelles (annee), 6 derniers mois glissants, annuelles
  - **Repartition du chiffre d'affaires par moyen de paiement**, filtrable par point de vente
  - **Cloture de caisse journaliere par point de vente** (`/admin/closing`) : montant attendu (calcule par le systeme) vs montant compte/declare par l'admin, avec calcul automatique des ecarts et un champ notes pour en tracer la raison
  - Gestion des produits (creation, suppression) et de leur stock par magasin
  - **Import et export Excel des produits** (colonnes: sku, name, category, price, compare_at_price, unit, description, is_active, puis une colonne stock:NomDuMagasin par point de vente)
  - Liste des commandes, avec affectation manuelle a un point de vente
- Django admin natif egalement utilisable (`/admin/`), avec import/export Excel integre sur la page Produits.
- **Comptabilite (admin)** : un onglet regroupe tous les documents financiers — vue d'ensemble (ventes, factures, creances, dettes, devis, ecarts de caisse), Devis, Factures, Bons de commande, Clotures de caisse, Clients / Fournisseurs et Rapports.
- **Inventaire (admin)** : inventaires physiques par point de vente (stock theorique fige, saisie du comptage ou feuille Excel a exporter/reimporter, ecarts en unites et en valeur, validation qui ajuste le stock). Chaque variation de stock (vente en caisse, facture, annulation, reception fournisseur, correction, inventaire, import) est journalisee dans **Mouvements de stock** (filtrable, exportee dans les rapports Excel).
- **Modele d'import Excel** : bouton "Telecharger le modele" dans Admin > Produits (feuille a remplir, exemple, instructions, une colonne de stock par point de vente).
- **Un site par point de vente** : Supermarche, Restaurant, Quincaillerie et Depot ont chacun leur site (`/s/supermarche`, `/s/resto`, `/s/quincaillerie`, `/s/depot`), leur catalogue, leurs categories, leur panier, leurs commandes (rattachees au point de vente, visibles dans « Commandes client » a la caisse, stock decremente au paiement) et leur application installable (manifeste PWA par site). Livraison ou retrait a emporter. Adresse de contact unique : info@labelleteranga.com. Sous-domaines : voir « Sites dedies par sous-domaine ».
- **Securite des ventes** : un caissier ne peut jamais supprimer une vente. Seul l'administrateur peut l'annuler (Admin > Commandes), avec son code secret a 4 chiffres (Parametres > Securite) ; motif et auteur sont conserves et le stock est remis en rayon.
- **Fermeture de caisse depuis l'admin** : Admin > Comptabilite > Clotures de caisse permet de fermer ou corriger la caisse de chaque caissier pour n'importe quel jour.

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

| sku | name | category | price | compare_at_price | unit | description | is_active | image_url | stock:&lt;Point de vente&gt; ... |
|-----|------|----------|-------|-------------------|------|--------------|-----------|-----------|------|

Obligatoires : `sku`, `name`, `price`. Une colonne `stock:<nom du point de vente>` par magasin. Le plus simple : telecharger le modele pre-rempli (`GET /api/catalog/products/import_template/` ou bouton "Telecharger le modele").

`sku` sert de cle : une ligne avec un sku existant met a jour le produit, sinon il est cree. La categorie est creee automatiquement si elle n'existe pas.

## Rapports de ventes

Endpoints (reserves admin, JWT requis) :

- `GET /api/reports/summary/` — chiffres cles (aujourd'hui, ce mois, mois precedent, cette annee)
- `GET /api/reports/daily/?days=30`
- `GET /api/reports/monthly/?year=2026`
- `GET /api/reports/yearly/`
- `GET /api/reports/previous-months/?count=6`

Tous se basent sur les commandes au statut `paid`.

## Images (Cloudinary)

Le disque de Render est ephemere : sans stockage externe, les photos envoyees depuis l'admin disparaissent au prochain deploiement. Definir la variable `CLOUDINARY_URL` (`cloudinary://API_KEY:API_SECRET@CLOUD_NAME`, visible dans Cloudinary > Dashboard > "API Environment variable") sur Render : toutes les images (upload admin et colonne `image_url` de l'import Excel) sont alors stockees sur Cloudinary et servies en format/qualite optimises. Sans cette variable, le disque local est utilise (developpement).

## Application mobile (PWA)

Le site est une Progressive Web App : installable directement depuis le navigateur, sans passer par l'App Store ni le Play Store (donc sans compte developpeur Apple/Google a payer).

- **iOS (Safari)** : ouvrir le site → bouton Partager → "Sur l'ecran d'accueil".
- **Android (Chrome)** : ouvrir le site → menu ⋮ → "Installer l'application" (ou banniere automatique).
- **Ordinateur (Chrome/Edge)** : icone d'installation dans la barre d'adresse.

Details techniques :
- `frontend/app/manifest.ts` genere `/manifest.webmanifest` (nom, icones, couleurs).
- `frontend/public/icons/` contient les icones generees a partir du logo (192px, 512px, maskable, apple-touch-icon).
- `frontend/public/sw.js` est un service worker minimal (installabilite + cache des seuls fichiers statiques) enregistre par `components/ServiceWorkerRegister.tsx`. Il ne met volontairement pas en cache les pages ni les appels API, pour ne jamais afficher un prix ou un stock perime hors-ligne.

**Important** : l'installation ne fonctionne que sur un site servi en HTTPS (ou en localhost). Elle n'a pas pu etre testee dans l'apercu de developpement de cette session (l'enregistrement du service worker y est bloque, probablement une restriction du bac a sable du navigateur d'apercu) — a verifier une fois le site deploye sur son domaine HTTPS final.

Pour une vraie application native publiee sur l'App Store / Play Store (icone telechargeable depuis les stores plutot que via le navigateur), il faudrait un compte Apple Developer Program (99 $/an) et Google Play Console (25 $ une fois), plus un empaquetage (ex. Capacitor) — un chantier separe, a lancer seulement si la PWA ne suffit pas.

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

## Sites dedies par sous-domaine

Le meme deploiement Vercel sert tous les sites. Une fois `labelleteranga.com` relie a Vercel, ajoutez les domaines `supermarche.`, `resto.`, `quincaillerie.` et `depot.labelleteranga.com` (ou un joker `*.labelleteranga.com`) au projet, puis definissez `NEXT_PUBLIC_ROOT_DOMAIN=labelleteranga.com`. Le fichier `frontend/proxy.ts` affiche alors le bon site pour chaque sous-domaine ; sans domaine, les adresses `/s/<site>` fonctionnent deja.

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
