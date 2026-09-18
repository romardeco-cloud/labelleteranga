"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import { Site, setActiveStore } from "@/lib/site";

type Ctx = { site: Site; base: string };
const SiteCtx = createContext<Ctx | null>(null);

export function SiteProvider({ site, children }: { site: Site; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  // Le panier de ce site est isole des autres (cle de session propre) : defini avant tout rendu enfant.
  setActiveStore(site.slug);
  // Sous /s/<slug> les liens gardent ce prefixe ; sur un sous-domaine dedie (rewrite) ils restent a la racine.
  const base = pathname.startsWith(`/s/${site.slug}`) ? `/s/${site.slug}` : "";
  return <SiteCtx.Provider value={{ site, base }}>{children}</SiteCtx.Provider>;
}

export function useSite(): Ctx {
  const ctx = useContext(SiteCtx);
  if (!ctx) throw new Error("useSite doit etre utilise dans un site.");
  return ctx;
}
