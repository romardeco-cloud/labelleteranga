"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import InstallApp from "@/components/site/InstallApp";
import InstallBanner from "@/components/site/InstallBanner";
import PendingPaymentBanner from "@/components/site/PendingPaymentBanner";
import { SiteProvider, useSite } from "@/components/site/SiteContext";
import SocialLinks, { socialHref, SocialIcon } from "@/components/SocialLinks";
import { StarsDisplay } from "@/components/Stars";
import { fetchCart } from "@/lib/api";
import { storeImage } from "@/lib/branding";
import { CONTACT_EMAIL, Site, shortName } from "@/lib/site";

function Header() {
  const { site, base } = useSite();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () =>
      fetchCart()
        .then((cart) => setCount(cart.items.reduce((sum, i) => sum + i.quantity, 0)))
        .catch(() => setCount(0));
    refresh();
    window.addEventListener("lbt-cart-changed", refresh);
    return () => window.removeEventListener("lbt-cart-changed", refresh);
  }, []);

  return (
    <header className="bg-brand text-white sticky top-0 z-20 shadow-md border-b-2 border-brand-accent">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 px-4 py-2.5">
        <Link href={base || "/"} className="flex items-center gap-3 min-w-0">
          <Image
            src={storeImage(site.name)}
            alt={site.name}
            width={72}
            height={48}
            className="h-11 w-auto object-contain rounded bg-white/95 p-0.5"
            priority
          />
          <span className="text-lg font-bold tracking-tight text-brand-accent truncate">{shortName(site.name)}</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <InstallApp
            appName={shortName(site.name)}
            className="hidden sm:inline-flex border border-white/40 rounded-full px-3 py-1.5 text-xs hover:bg-white/10"
          />
          <Link href={base || "/"} className="hover:text-brand-accent transition">
            {site.slug === "resto" ? "Menu" : "Boutique"}
          </Link>
          {(site.combos_count ?? 0) > 0 && (
            <Link href={`${base}/evenements`} className="hidden sm:inline hover:text-brand-accent transition">
              Evenements
            </Link>
          )}
          <Link href={`${base}/avis`} className="hidden sm:inline hover:text-brand-accent transition">
            Avis
          </Link>
          <Link href={`${base}/cart`} className="relative hover:text-brand-accent transition">
            Panier
            {count > 0 && (
              <span className="absolute -top-2 -right-4 bg-brand-accent text-brand-dark text-xs rounded-full px-1.5 py-0.5 font-bold">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Comptes saisis dans Parametres ; a defaut, le numero du point de vente sert pour WhatsApp et le telephone. */
function siteSocials(site: Site) {
  const phone = site.phone?.trim();
  return { ...(phone ? { whatsapp: phone, phone } : {}), ...(site.social_links ?? {}) };
}

function Footer() {
  const { site, base } = useSite();
  return (
    <footer className="border-t-2 border-brand-accent/40 mt-16 py-8 text-center text-sm text-gray-600 space-y-1.5 bg-brand-light">
      <p className="text-brand-dark font-semibold">{site.name}</p>
      {site.description && <p>{site.description}</p>}
      {site.address && <p>{site.address}</p>}
      {site.phone && (
        <p>
          Tel :{" "}
          <a href={`tel:${site.phone.replace(/\s+/g, "")}`} className="text-brand hover:underline">
            {site.phone}
          </a>
        </p>
      )}
      <p>
        Contact :{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand hover:underline">
          {CONTACT_EMAIL}
        </a>
      </p>
      {(site.rccm || site.ninea) && (
        <p className="text-xs text-gray-500">
          {site.rccm && <>RCCM : {site.rccm}</>}
          {site.rccm && site.ninea && " \u00b7 "}
          {site.ninea && <>NINEA : {site.ninea}</>}
        </p>
      )}
      <InstallApp appName={shortName(site.name)} className="sm:hidden text-brand underline" />
      <p className="text-xs">
        <Link href="/confidentialite" className="underline">Confidentialite</Link> &middot; <Link href="/conditions" className="underline">Conditions</Link>
      </p>
      {site.reviews && site.reviews.count > 0 && (
        <Link href={`${base}/avis`} className="inline-flex items-center gap-2 hover:underline">
          <StarsDisplay value={site.reviews.overall} size={15} />
          <span>
            {site.reviews.overall?.toFixed(1)} / 5 ({site.reviews.count} avis)
          </span>
        </Link>
      )}
      <p>
        <Link href={`${base}/avis`} className="text-brand underline">Donner mon avis</Link>
        {(site.combos_count ?? 0) > 0 && (
          <>
            {" "}&middot; <Link href={`${base}/evenements`} className="text-brand underline">Combos &amp; evenements</Link>
          </>
        )}
      </p>
      <SocialLinks links={siteSocials(site)} />
      <p className="text-xs text-gray-400 pt-2">
        &copy; {new Date().getFullYear()} La Belle Teranga &mdash; <span className="italic">L&apos;art du service</span>
      </p>
    </footer>
  );
}

function WhatsAppButton() {
  const { site } = useSite();
  const href = socialHref("whatsapp", siteSocials(site).whatsapp);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Nous ecrire sur WhatsApp"
      className="fixed bottom-4 right-4 z-30 w-12 h-12 rounded-full bg-[#25d366] text-white shadow-lg flex items-center justify-center hover:scale-105 transition"
    >
      <SocialIcon name="whatsapp" size={26} />
    </a>
  );
}

export default function SiteShell({ site, children }: { site: Site; children: React.ReactNode }) {
  return (
    <SiteProvider site={site}>
      <Header />
      <InstallBanner />
      <PendingPaymentBanner />
      <main className="min-h-[70vh]">{children}</main>
      <Footer />
      <WhatsAppButton />
    </SiteProvider>
  );
}
