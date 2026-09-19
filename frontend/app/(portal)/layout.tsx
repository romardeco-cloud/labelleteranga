import Image from "next/image";
import Link from "next/link";
import SocialLinks from "@/components/SocialLinks";
import { CONTACT_EMAIL, fetchSites } from "@/lib/site";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const sites = await fetchSites();
  const main = sites.find((s) => s.slug === "resto" && s.phone) ?? sites.find((s) => s.phone);
  const links = main ? { ...(main.social_links ?? {}), whatsapp: main.social_links?.whatsapp || main.phone, phone: main.social_links?.phone || main.phone } : undefined;
  return (
    <>
      <header className="bg-brand text-white sticky top-0 z-20 shadow-md border-b-2 border-brand-accent">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-2.5">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.jpg" alt="La Belle Teranga" width={44} height={44} className="rounded-full ring-2 ring-brand-accent" priority />
            <span className="text-xl font-bold tracking-tight text-brand-accent">La Belle Teranga</span>
          </Link>
          <nav className="text-sm font-medium">
            <Link href="/admin" className="opacity-80 hover:opacity-100 hover:text-brand-accent transition">
              Espace pro
            </Link>
          </nav>
        </div>
      </header>
      <main className="min-h-screen">{children}</main>
      <footer className="border-t-2 border-brand-accent/40 mt-16 py-8 text-center text-sm text-gray-500 space-y-1 bg-brand-light">
        <p className="text-brand-dark font-medium italic">L&apos;art du service</p>
        <p>&copy; {new Date().getFullYear()} La Belle Teranga &mdash; Labelleteranga.com</p>
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
