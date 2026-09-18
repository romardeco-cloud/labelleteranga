import { NextRequest, NextResponse } from "next/server";

// Un site dedie par point de vente : supermarche.labelleteranga.com, resto.labelleteranga.com, etc.
// (necessite le domaine + un sous-domaine par site, ou un joker *.labelleteranga.com, sur Vercel).
// Sans sous-domaine, les memes sites restent disponibles sous /s/<site>.
const HOSTS: Record<string, string> = {
  supermarche: "supermarche",
  resto: "resto",
  restaurant: "resto",
  quincaillerie: "quincaillerie",
  depot: "depot",
};

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const sub = host.split(".")[0];
  const slug = host.includes(".") ? HOSTS[sub] : undefined;
  if (!slug) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/s/") || pathname.startsWith("/_next") || pathname.startsWith("/icons") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }
  // fichiers statiques (logo, images, service worker...) servis tels quels
  if (/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith(".webmanifest")) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/s/${slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
