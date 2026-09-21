"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import ProductVisual from "@/components/ProductVisual";
import { useSite } from "@/components/site/SiteContext";
import { BandsData, fetchSiteBands } from "@/lib/engage";

const xof = (v: number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(v) + " FCFA";

/** Bandes de pub du site : titre et texte a gauche, cartes de plats (photo, nom, prix) a droite. Gerees dans Admin > Bandes de pub. */
export default function PromoBands() {
  const { site, base } = useSite();
  const [data, setData] = useState<BandsData | null>(null);

  useEffect(() => {
    fetchSiteBands(site.slug)
      .then(setData)
      .catch(() => {});
  }, [site.slug]);

  if (!data || data.bands.length === 0) return null;
  const { contact } = data;

  return (
    <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
      {data.bands.map((b) => (
        <section key={b.id} className="grid lg:grid-cols-[5fr_8fr] overflow-hidden rounded-3xl border border-black/5 shadow-lg" aria-label={b.title}>
          <div className="bg-gradient-to-br from-[#7a1414] via-[#6a1010] to-[#450909] text-white p-4 sm:p-8 flex flex-col justify-center">
            <Image src="/logo.jpg" alt="La Belle Teranga" width={72} height={72} className="hidden sm:block h-16 w-16 rounded-full ring-2 ring-white/70 shadow mb-5" />
            <p className="text-[11px] font-bold tracking-[0.3em] text-[#f5b942]">LA BELLE TERANGA</p>
            <h2 className="mt-1 sm:mt-2 font-serif text-2xl sm:text-4xl font-bold leading-tight text-[#fde9b8]">{b.title}</h2>
            <span className="my-2 sm:my-4 block h-0.5 w-12 sm:w-16 bg-[#f5b942]" />
            {b.text && <p className="text-sm sm:text-lg leading-snug text-white/90 max-w-md">{b.text}</p>}
            <div className="hidden sm:block mt-5 text-xs sm:text-sm text-white/80 space-y-0.5">
              {contact.address && <p>{contact.address}</p>}
              <p>{[contact.phone, contact.email].filter(Boolean).join("  •  ")}</p>
            </div>
          </div>
          <div className="bg-[#fbf6ec] p-3 sm:p-5 flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory items-stretch">
            {b.items.map((it) => (
              <Link
                key={`${it.kind}-${it.id}`}
                href={it.kind === "combo" ? `${base}/evenements` : `${base}/product/${it.id}`}
                className="relative snap-start shrink-0 w-36 sm:w-44 h-56 sm:h-72 overflow-hidden rounded-2xl shadow-md bg-brand-light group"
              >
                <div className="absolute inset-0">
                  <ProductVisual image={it.image} name={it.name} category={null} cover />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#2a0a0a] via-[#2a0a0a]/85 to-transparent px-3 pb-3 pt-14 text-center">
                  <p className="font-serif text-lg font-bold leading-tight text-[#fde9b8] line-clamp-2">{it.name}</p>
                  {b.show_prices ? (
                    <p className="mt-0.5 text-xs text-white/90">
                      {it.from_price && "Dès "}
                      {xof(it.price)}
                    </p>
                  ) : (
                    it.subtitle && <p className="mt-0.5 text-xs text-white/90">{it.subtitle}</p>
                  )}
                  {b.show_prices && it.subtitle && <p className="text-[11px] text-white/70 line-clamp-1">{it.subtitle}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
