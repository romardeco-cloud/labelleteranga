"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import QrCode, { useQrDataUrl } from "@/components/site/QrCode";
import { storeImage } from "@/lib/branding";
import { Site, fetchSites, shortName } from "@/lib/site";

// Les deux applications mises en avant ; les autres points de vente en ligne suivent.
const FEATURED = ["resto", "supermarche"];

function AppCard({ site, origin }: { site: Site; origin: string }) {
  const link = `${origin}/${site.slug}?install=1`;
  const shortLink = `${origin.replace(/^https?:\/\//, "")}/${site.slug}`;
  const png = useQrDataUrl(link, 1024);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}/${site.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copiez ce lien :", `${origin}/${site.slug}`);
    }
  }

  return (
    <article className="border rounded-2xl bg-white p-6 text-center flex flex-col items-center">
      <Image src={storeImage(site.name)} alt={site.name} width={200} height={130} className="h-20 w-auto object-contain mb-3" />
      <h2 className="text-xl font-bold text-brand-dark">{shortName(site.name)}</h2>
      <p className="text-sm text-gray-500 mb-4">Application de commande en ligne</p>

      <QrCode url={link} size={220} className="border" />
      <p className="text-xs text-gray-500 mt-2">Scannez avec l&apos;appareil photo de votre telephone</p>

      <p className="mt-4 font-mono text-sm bg-brand-light rounded-lg px-3 py-2 break-all">{shortLink}</p>

      <div className="mt-4 flex flex-wrap justify-center gap-2 w-full">
        <a href={`/${site.slug}?install=1`} className="bg-brand text-white rounded-lg px-4 py-2.5 text-sm font-medium">
          Ouvrir et installer
        </a>
        <button onClick={copy} className="border rounded-lg px-4 py-2.5 text-sm">
          {copied ? "Lien copie !" : "Copier le lien"}
        </button>
        {png && (
          <a href={png} download={`qr-${site.slug}.png`} className="border rounded-lg px-4 py-2.5 text-sm">
            Telecharger le QR (PNG)
          </a>
        )}
        <Link href={`/app/${site.slug}/poster`} className="border rounded-lg px-4 py-2.5 text-sm">
          Affiche a imprimer
        </Link>
      </div>
    </article>
  );
}

export default function AppDownloadPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetchSites().then((list) =>
      setSites([...list].sort((a, b) => (FEATURED.indexOf(a.slug) + 1 || 99) - (FEATURED.indexOf(b.slug) + 1 || 99)))
    );
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-brand-dark text-center">Telechargez nos applications</h1>
      <p className="text-gray-600 text-center mt-2 mb-8">
        Scannez le code ou ouvrez le lien depuis votre telephone : l&apos;application s&apos;installe en quelques secondes, sans passer par une boutique
        d&apos;applications.
      </p>

      {origin && (
        <div className="grid sm:grid-cols-2 gap-6">
          {sites.map((s) => (
            <AppCard key={s.slug} site={s} origin={origin} />
          ))}
        </div>
      )}

      <section className="mt-10 grid sm:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-semibold text-brand-dark mb-2">Sur Android</h3>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
            <li>Scannez le code QR ou ouvrez le lien dans Chrome.</li>
            <li>
              Touchez <strong>&laquo; Installer l&apos;application &raquo;</strong> (bouton en haut de la page).
            </li>
            <li>Confirmez : l&apos;icone apparait sur votre ecran d&apos;accueil.</li>
          </ol>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-semibold text-brand-dark mb-2">Sur iPhone / iPad</h3>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
            <li>
              Scannez le code QR ou ouvrez le lien dans <strong>Safari</strong>.
            </li>
            <li>
              Touchez <strong>Partager</strong> (carre avec une fleche).
            </li>
            <li>
              Choisissez <strong>&laquo; Sur l&apos;ecran d&apos;accueil &raquo;</strong> puis <strong>Ajouter</strong>.
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}
