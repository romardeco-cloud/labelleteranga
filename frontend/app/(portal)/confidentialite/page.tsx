import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "Politique de confidentialite | La Belle Teranga" };

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-5 text-gray-700 leading-relaxed">
      <h1 className="text-3xl font-bold text-brand-dark">Politique de confidentialite</h1>
      <p className="text-sm text-gray-500">Derniere mise a jour : septembre 2026</p>

      <p>
        La Belle Teranga (supermarche, restaurant &amp; fast-food, quincaillerie, depot d&apos;aliments pour volaille, service de forage) respecte la vie
        privee de ses clients. Cette page explique quelles donnees sont collectees par nos sites et applications de commande en ligne, pourquoi, et
        comment exercer vos droits.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Donnees collectees</h2>
      <ul className="list-disc list-inside space-y-1">
        <li>Identite et contact : nom, adresse e-mail, numero de telephone (WhatsApp).</li>
        <li>Livraison : adresse et, si vous l&apos;autorisez, votre position GPS (facultative).</li>
        <li>Commande : articles, montant, moyen de paiement, reference de transaction Wave / Orange Money le cas echeant.</li>
        <li>Donnees techniques : type d&apos;appareil et navigateur, necessaires au bon fonctionnement de l&apos;application.</li>
      </ul>
      <p>Nous ne collectons jamais votre code secret Wave / Orange Money ni les numeros de votre carte bancaire.</p>

      <h2 className="text-xl font-semibold text-brand-dark">Utilisation</h2>
      <ul className="list-disc list-inside space-y-1">
        <li>Traiter, preparer et livrer votre commande, et verifier votre paiement.</li>
        <li>Vous envoyer la confirmation de commande par WhatsApp, avec votre numero de commande.</li>
        <li>Repondre a vos questions et assurer le service apres-vente.</li>
        <li>Etablir nos factures et tenir notre comptabilite (obligations legales).</li>
      </ul>

      <h2 className="text-xl font-semibold text-brand-dark">Partage</h2>
      <p>
        Vos donnees ne sont pas vendues. Elles sont transmises uniquement aux prestataires necessaires a votre commande : hebergement (Render,
        Vercel), messagerie WhatsApp (Meta), et services de paiement (Wave, Orange Money, Stripe) lorsque vous les utilisez.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Conservation et securite</h2>
      <p>
        Les donnees de commande sont conservees pendant la duree exigee par nos obligations comptables, puis supprimees ou anonymisees. Les echanges
        sont chiffres (HTTPS) et l&apos;acces a l&apos;espace de gestion est protege par mot de passe.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Vos droits</h2>
      <p>
        Vous pouvez demander l&apos;acces, la rectification ou la suppression de vos donnees en nous ecrivant a{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
          {CONTACT_EMAIL}
        </a>
        , en indiquant votre nom et votre numero de commande.
      </p>

      <h2 className="text-xl font-semibold text-brand-dark">Contact</h2>
      <p>
        La Belle Teranga &mdash;{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
          {CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}
