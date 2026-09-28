import Link from "next/link";
import SocialLinks from "@/components/SocialLinks";
import StaffLink from "@/components/StaffLink";
import { fetchCompanyBranding } from "@/lib/branding";
import { CONTACT_EMAIL, fetchSites } from "@/lib/site";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [sites, branding] = await Promise.all([fetchSites(), fetchCompanyBranding()]);
  const main = sites.find((s) => s.slug === "resto" && s.phone) ?? sites.find((s) => s.phone);
  const links = main ? { ...(main.social_links ?? {}), whatsapp: main.social_links?.whatsapp || main.phone, phone: main.social_links?.phone || main.phone } : undefined;
  return (
    <>
      <header className="bg-brand text-white sticky top-0 z-20 shadow-md border-b-2 border-brand-accent">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-2.5">
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logo || "/logo.jpg"} alt={branding.name} width={44} height={44} className="rounded-full ring-2 ring-brand-accent object-cover w-11 h-11" />
            <span className="text-xl font-bold tracking-tight text-brand-accent">{branding.name}</span>
          </Link>
          <nav className="text-sm font-medium">
            <StaffLink />
          </nav>
        </div>
      </header>
      <main className="min-h-screen">{children}</main>
      <footer className="border-t-2 border-brand-accent/40 mt-16 py-8 text-center text-sm text-gray-500 space-y-1 bg-brand-light">
        <p className="text-brand-dark font-medium italic">L&apos;art du service</p>
        <p>&copy; {new Date().getFullYear()} {branding.name} &mdash; Labelleteranga.com</p>
        <p>
          Contact :{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="text-xs">
          <Link href="/confidentialite" className="underline">Confidentialite</Link> &middot; <Link href="/conditions" className="underline">Conditions</Link>
        </p>
        <SocialLinks links={links} />
      </footer>
    </>
  );
}
