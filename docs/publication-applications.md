# Publier les applications La Belle Teranga (Google Play et App Store)

Les sites de commande sont des **PWA** : ils s'installent deja depuis n'importe quel navigateur (Chrome, Edge, Safari...).
Pour les mettre aussi dans les boutiques, on les « emballe » : **Google Play** (Trusted Web Activity) et **App Store** (application iOS).
Cet emballage necessite des comptes a VOTRE nom, un paiement et une validation par Google / Apple : personne ne peut le faire a votre place.

## Ce qui est deja pret (cote site)

- Manifeste d'application par point de vente (`/s/resto/manifest.webmanifest`, `/s/supermarche/...`) avec icones 192/512/maskable.
- Pages obligatoires : **politique de confidentialite** (`/confidentialite`) et **conditions** (`/conditions`).
- Fichier de liaison Android : `/.well-known/assetlinks.json` (rempli via la variable Vercel `ANDROID_ASSETLINKS_JSON`).
- Adresse de contact unique : info@labelleteranga.com.

## 1. Google Play (Android) — le plus simple, gratuit cote outils

Cout : **25 $ une seule fois** (compte developpeur Google Play). Delai de validation : quelques jours.

1. Creez le compte sur https://play.google.com/console (identite + paiement de 25 $). Google demande une verification d'identite.
2. Allez sur **https://www.pwabuilder.com**, collez l'adresse du site, par exemple `https://frontend-umber-ten-209ve5rkqa.vercel.app/s/resto`
   (ou `https://labelleteranga.com/resto` quand le domaine sera relie), puis « Package for stores » > **Android**.
3. Renseignez : nom de l'application, identifiant de paquet (ex. `com.labelleteranga.resto`), version 1. PWABuilder vous fournit un fichier
   `.aab` et une **empreinte SHA-256** de signature.
4. Sur Vercel > Settings > Environment Variables, ajoutez `ANDROID_ASSETLINKS_JSON` avec le JSON « assetlinks » fourni par PWABuilder
   (il contient le nom du paquet et l'empreinte). Redeployez. Verifiez `https://.../.well-known/assetlinks.json`.
5. Dans la Play Console : creez l'application, importez le `.aab`, ajoutez la fiche (textes ci-dessous), les captures d'ecran (2 minimum, prises
   sur telephone), l'icone 512x512 (`frontend/public/icons/resto-512.png`), la politique de confidentialite (`/confidentialite`), le questionnaire
   « Sécurité des données » et le classement de contenu. Envoyez en production.
6. Repetez pour le supermarche (`com.labelleteranga.supermarche`).

## 2. App Store (iPhone) — plus lourd

Cout : **99 $ par an** (Apple Developer Program). Il faut un **Mac avec Xcode** pour compiler. Delai de validation : 1 a 7 jours.

1. Inscrivez-vous sur https://developer.apple.com/programs (identite, paiement).
2. Sur pwabuilder.com > « Package for stores » > **iOS** : telechargez le projet Xcode genere.
3. Sur un Mac, ouvrez le projet dans Xcode, renseignez l'identifiant (ex. `com.labelleteranga.resto`), l'equipe (votre compte), les icones, puis
   « Product > Archive > Distribute App » vers App Store Connect.
4. Dans App Store Connect : fiche, captures (iPhone 6,7"), confidentialite, classification, puis « Soumettre a la revue ».

Attention : Apple refuse parfois les applications qui ne sont qu'un site emballe (regle 4.2). Pour maximiser les chances : expliquer dans les notes
de revue que l'application permet de **commander, payer et suivre des commandes reelles** aupres d'un commerce, fournir un compte de test, et
eventuellement ajouter des notifications. Si le refus persiste, l'installation depuis Safari (« Sur l'ecran d'accueil ») reste disponible.

## Textes de fiche (a copier-coller)

### Restaurant

- **Nom** : La Belle Teranga Resto
- **Description courte (80 c.)** : Commandez vos plats et fast-food en ligne, livraison ou a emporter.
- **Description longue** : Retrouvez le menu de La Belle Teranga Resto & Fast-food : burgers, chawarmas, poulet frit et frites, plats du midi, patisseries
  et boissons. Commandez en quelques touches, choisissez la livraison ou le retrait a emporter, payez en especes, par Wave ou Orange Money, et recevez la
  confirmation de votre commande par WhatsApp avec votre numero de commande.
- **Categorie** : Alimentation et boissons — **Contact** : info@labelleteranga.com

### Supermarche

- **Nom** : La Belle Teranga Supermarche
- **Description courte (80 c.)** : Vos courses du quotidien, livrees chez vous ou a retirer en magasin.
- **Description longue** : Faites vos courses en ligne chez La Belle Teranga : fruits et legumes, produits secs, produits laitiers, boissons, hygiene,
  articles de bebe et papeterie. Ajoutez au panier, choisissez la livraison ou le retrait, payez par Wave, Orange Money ou en especes, et recevez la
  confirmation par WhatsApp.
- **Categorie** : Shopping — **Contact** : info@labelleteranga.com

## Ce que vous devez me fournir / faire

1. Creer les comptes (Google Play 25 $, Apple 99 $/an si vous voulez iPhone) : c'est a votre nom et je ne peux ni les creer ni payer.
2. Me donner le nom de domaine definitif (les fiches et QR codes doivent pointer vers l'adresse finale).
3. Prendre 3 a 5 captures d'ecran de l'application sur telephone (menu, panier, paiement) pour les fiches.
4. Me transmettre le JSON `assetlinks` de PWABuilder : je le branche pour vous, ou collez-le dans `ANDROID_ASSETLINKS_JSON` sur Vercel.
