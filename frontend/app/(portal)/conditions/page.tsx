import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Conditions d'utilisation | La Belle Teranga" };

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-5 text-gray-700 leading-relaxed">
      <h1 className="text-3xl font-bold text-brand-dark">Conditions d&apos;utilisation et de vente</h1>
      <p className="text-sm text-gray-500">Derniere mise a jour : septembre 2026</p>

      <h2 className="text-xl font-semibold text-brand-dark">Commandes</h2>
      <p>
        Les sites et applications La Belle Teranga permettent de commander aupres de chaque point de vente (supermarche, restaurant &amp; fast-food,
        quincaillerie, depot d&apos;aliments pour volaille). Une commande est consideree comme confirmee lorsque le paiement est recu et verifie ; vous
        recevez alors un message WhatsApp avec votre numero de commande.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Prix et disponibilite</h2>
      <p>
        Les prix sont indiques en francs CFA (FCFA). Les produits sont proposes dans la limite des stocks disponibles ; en cas d&apos;indisponibilite
        apres commande, nous vous contactons pour un echange ou un remboursement.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Paiement</h2>
      <p>
        Le paiement s&apos;effectue en especes a la livraison ou au retrait, par Wave ou Orange Money (vers le compte marchand du point de vente
        concerne), ou par carte bancaire lorsque ce mode est propose. Pour Wave et Orange Money, le client valide son paiement en indiquant la
        reference de sa transaction ; la commande est traitee apres verification.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Livraison et retrait</h2>
      <p>
        La livraison est faite a l&apos;adresse indiquee lors de la commande. Le retrait a emporter se fait au point de vente choisi. Les delais
        dependent du produit et de la zone de livraison.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Annulation et reclamations</h2>
      <p>
        Toute reclamation doit mentionner le numero de commande et etre envoyee a{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
          {CONTACT_EMAIL}
        </a>
        . Une vente ne peut etre annulee que par La Belle Teranga.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Donnees personnelles</h2>
      <p>
        Le traitement de vos donnees est decrit dans notre{" "}
        <a href="/confidentialite" className="text-brand underline">
          politique de confidentialite
        </a>
        .
      </p>
    </div>
  );
}
