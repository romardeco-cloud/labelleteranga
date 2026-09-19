import { fetchSite, iconSet, shortName } from "@/lib/site";

// Manifeste PWA propre a chaque site : chaque point de vente s'installe comme sa propre application.
export async function GET(_req: Request, { params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  const site = await fetchSite(store);
  if (!site) return new Response("Not found", { status: 404 });
  const icons = iconSet(store);
  const manifest = {
    id: `/s/${store}`,
    name: site.name,
    short_name: shortName(site.name).slice(0, 16),
    description: site.description || `Commandez en ligne chez ${site.name}.`,
    // le scope doit contenir start_url (sinon Chrome/Edge refusent l'installation) : pas de "/" final
    start_url: `/s/${store}`,
    scope: `/s/${store}`,
    categories: ["food", "shopping", "business"],
    shortcuts: [
      { name: "Mon panier", short_name: "Panier", url: `/s/${store}/cart`, icons: [{ src: `/icons/${icons}-192.png`, sizes: "192x192" }] },
    ],
    display: "standalone",
    background_color: "#fdf8ee",
    theme_color: "#9c1c1c",
    lang: "fr",
    icons: [
      { src: `/icons/${icons}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/icons/${icons}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/icons/${icons}-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=300" },
  });
}
