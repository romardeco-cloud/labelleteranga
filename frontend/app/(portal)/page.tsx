import Image from "next/image";
import Link from "next/link";
import { storeImage } from "@/lib/branding";
import { fetchSites, shortName, siteUrl } from "@/lib/site";

export const revalidate = 60;

export default async function PortalPage() {
  const sites = await fetchSites();

  return (
    <div>
      <div
        className="w-full text-center py-16 px-4 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(110,18,18,0.55), rgba(110,18,18,0.7)), url('/hero.jpg'), linear-gradient(135deg, #9c1c1c, #6e1212)",
        }}
      >
        <Image src="/logo.jpg" alt="La Belle Teranga" width={96} height={96} className="rounded-full mx-auto mb-4 ring-4 ring-brand-accent" priority />
        <h1 className="text-4xl font-bold text-white mb-2 drop-shadow">La Belle Teranga</h1>
        <p className="text-brand-accent italic mb-1 text-lg">L&apos;art du service</p>
        <p className="text-white/90">Supermarche, restaurant, quincaillerie, aliments pour volaille et forage.</p>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <h2 className="text-2xl font-bold text-brand-dark mb-1">Commandez en ligne</h2>
        <p className="text-gray-500 mb-6">Chaque point de vente a son propre site et son propre panier.</p>

        {sites.length === 0 ? (
          <p className="text-gray-500">Les sites seront bientot disponibles.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-5">
            {sites.map((site) => (
              <Link
                key={site.slug}
                href={siteUrl(site.slug)}
                className="group border rounded-2xl bg-white overflow-hidden flex flex-col hover:border-brand hover:shadow-md transition"
              >
                <div className="bg-white h-44 flex items-center justify-center p-3 border-b">
                  <Image
                    src={storeImage(site.name)}
                    alt={site.name}
                    width={400}
                    height={260}
                    className="max-h-full w-auto object-contain group-hover:scale-105 transition"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-semibold text-lg text-brand-dark">{shortName(site.name)}</h3>
                  {site.description && <p className="text-sm text-gray-600 mt-1 flex-1">{site.description}</p>}
                  {site.address && <p className="text-xs text-gray-400 mt-2">{site.address}</p>}
                  <span className="mt-4 inline-block bg-brand text-white text-sm font-medium px-4 py-2 rounded-lg w-fit">
                    {site.slug === "resto" ? "Voir le menu et commander" : "Visiter le site"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <section className="mt-12 rounded-2xl bg-brand-light border border-brand-accent/40 p-6 text-center">
          <h2 className="font-semibold text-brand-dark mb-1">Application mobile</h2>
          <p className="text-sm text-gray-600">
            Ouvrez le site du point de vente de votre choix puis touchez « Installer l&apos;application » : elle s&apos;ajoute a l&apos;ecran
            d&apos;accueil de votre telephone (iPhone et Android).
          </p>
        </section>
      </div>
    </div>
  );
}
