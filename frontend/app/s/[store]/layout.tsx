import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteShell from "@/components/site/SiteShell";
import { fetchSite, iconSet, shortName } from "@/lib/site";

type Params = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { store } = await params;
  const site = await fetchSite(store);
  if (!site) return {};
  const icons = iconSet(store);
  return {
    title: `${site.name} | Commande en ligne`,
    description: site.description || `Commandez en ligne chez ${site.name}.`,
    manifest: `/s/${store}/manifest.webmanifest`,
    icons: { icon: `/icons/${icons}-192.png`, apple: `/icons/${icons}-apple.png` },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: shortName(site.name) },
  };
}

export default async function StoreLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { store } = await params;
  const site = await fetchSite(store);
  if (!site) notFound();
  return <SiteShell site={site}>{children}</SiteShell>;
}
