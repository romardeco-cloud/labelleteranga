"use client";

import { usePathname } from "next/navigation";
import SocialLinks from "@/components/SocialLinks";

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/caisse")) return null;
  if (pathname?.startsWith("/admin") && pathname !== "/admin/login") return null;

  return (
    <footer className="border-t-2 border-brand-accent/40 mt-16 py-8 text-center text-sm text-gray-500 space-y-1 bg-brand-light">
      <p className="text-brand-dark font-medium italic">L&apos;art du service</p>
      <p>© {new Date().getFullYear()} La Belle Teranga — Labelleteranga.com</p>
      <p>
        Contact :{" "}
        <a href="mailto:info@labelleteranga.com" className="text-brand hover:underline">
          info@labelleteranga.com
        </a>
      </p>
      <SocialLinks />
    </footer>
  );
}
