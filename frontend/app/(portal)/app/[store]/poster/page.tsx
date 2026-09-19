"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QrCode from "@/components/site/QrCode";
import { storeImage } from "@/lib/branding";
import { Site, displayUrl, fetchSite, shortName, siteUrl } from "@/lib/site";

/** Affiche A4 a imprimer (vitrine, comptoir, flyers) : QR code de l'application du point de vente. */
export default function PosterPage() {
  const { store } = useParams<{ store: string }>();
  const [site, setSite] = useState<Site | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetchSite(store).then(setSite);
  }, [store]);

  if (!site || !origin) return <p className="p-8">Chargement...</p>;
  const link = `${siteUrl(site)}?install=1`;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 text-center print:py-0">
      <div className="print:hidden mb-4 flex justify-between items-center">
        <Link href="/app" className="text-sm text-brand underline">
          &larr; Retour
        </Link>
        <button onClick={() => window.print()} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium">
          Imprimer l&apos;affiche
        </button>
      </div>

      <div className="border-4 border-brand rounded-3xl p-10 bg-white">
        <Image src={storeImage(site.name)} alt={site.name} width={320} height={220} className="mx-auto h-36 w-auto object-contain" priority />
        <h1 className="text-4xl font-extrabold text-brand-dark mt-4">{shortName(site.name)}</h1>
        <p className="text-xl text-brand mt-2 font-semibold">Commandez depuis votre telephone</p>
        <div className="my-6 flex justify-center">
          <QrCode url={link} size={380} className="border-2 border-brand-dark" />
        </div>
        <p className="text-2xl font-bold text-brand-dark">Scannez pour installer l&apos;application</p>
        <p className="text-gray-600 mt-2">ou allez sur</p>
        <p className="font-mono text-xl mt-1">{displayUrl(site)}</p>
        <p className="text-sm text-gray-500 mt-6">
          {site.phone ? `Tel : ${site.phone} - ` : ""}info@labelleteranga.com
        </p>
        <p className="text-brand italic mt-1">L&apos;art du service</p>
      </div>
    </div>
  );
}
