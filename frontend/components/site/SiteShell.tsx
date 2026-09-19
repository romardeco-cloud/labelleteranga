"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import InstallApp from "@/components/site/InstallApp";
import PendingPaymentBanner from "@/components/site/PendingPaymentBanner";
import { SiteProvider, useSite } from "@/components/site/SiteContext";
import SocialLinks from "@/components/SocialLinks";
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

function Footer() {
  const { site } = useSite();
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
      <InstallApp appName={shortName(site.name)} className="sm:hidden text-brand underline" />
      <SocialLinks />
      <p className="text-xs text-gray-400 pt-2">
        &copy; {new Date().getFullYear()} La Belle Teranga &mdash; <span className="italic">L&apos;art du service</span>
      </p>
    </footer>
  );
}

export default function SiteShell({ site, children }: { site: Site; children: React.ReactNode }) {
  return (
    <SiteProvider site={site}>
      <Header />
      <PendingPaymentBanner />
      <main className="min-h-[70vh]">{children}</main>
      <Footer />
    </SiteProvider>
  );
}
