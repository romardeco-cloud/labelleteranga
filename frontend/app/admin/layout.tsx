"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { IconName } from "@/components/admin/Icon";
import { clearAdminToken, getAdminToken } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean; match?: string[] };

// Onglet "Comptabilite" : regroupe tous les documents et etats financiers.
const ACCOUNTING_TABS: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin/accounting", label: "Vue d'ensemble", exact: true },
  { href: "/admin/documents/quotes", label: "Devis" },
  { href: "/admin/documents/invoices", label: "Factures" },
  { href: "/admin/documents/purchase-orders", label: "Bons de commande" },
  { href: "/admin/closing", label: "Clotures de caisse" },
  { href: "/admin/contacts", label: "Clients / Fournisseurs" },
  { href: "/admin/reports", label: "Rapports" },
];

const ACCOUNTING_PREFIXES = ["/admin/accounting", "/admin/documents", "/admin/closing", "/admin/contacts", "/admin/reports"];

const MAIN_NAV: NavItem[] = [
  { href: "/admin", label: "Tableau de bord", icon: "dashboard", exact: true },
  { href: "/admin/accounting", label: "Comptabilite", icon: "book", match: ACCOUNTING_PREFIXES },
  { href: "/admin/inventory", label: "Inventaire", icon: "clipboard" },
  { href: "/admin/products", label: "Produits", icon: "box" },
  { href: "/admin/categories", label: "Categories", icon: "list" },
  { href: "/admin/promotions", label: "Promotions", icon: "tag" },
  { href: "/admin/orders", label: "Commandes", icon: "cart" },
  { href: "/admin/cashiers", label: "Caissiers", icon: "users" },
  { href: "/admin/stores", label: "Points de vente", icon: "store" },
  { href: "/admin/settings", label: "Parametres", icon: "settings" },
];

function isActive(pathname: string | null, item: { href: string; exact?: boolean; match?: string[] }) {
  if (!pathname) return false;
  if (item.match) return item.match.some((p) => pathname.startsWith(p));
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (!isLoginPage && !getAdminToken()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [isLoginPage, router]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (isLoginPage) return <>{children}</>;
  if (!ready) return <p className="p-8">Verification...</p>;

  const inAccounting = ACCOUNTING_PREFIXES.some((p) => pathname?.startsWith(p));

  const logout = () => {
    clearAdminToken();
    router.push("/admin/login");
  };

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b">
        <Image src="/logo.jpg" alt="La Belle Teranga" width={44} height={44} className="rounded-full ring-2 ring-brand-accent" />
        <div className="leading-tight">
          <p className="font-bold text-white">La Belle Teranga</p>
          <p className="text-xs text-brand-accent">Administration</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {MAIN_NAV.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                active ? "bg-[#b3261e]/25 text-[#f5b942]" : "text-[#a99b96] hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t space-y-1">
        <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#a99b96] hover:bg-white/5 hover:text-white">
          <Icon name="globe" />
          Voir le site
        </Link>
        <Link href="/app" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#a99b96] hover:bg-white/5 hover:text-white">
          <Icon name="menu" />
          Liens et QR codes des apps
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#f87171] hover:bg-white/5"
        >
          <Icon name="logout" />
          Deconnexion
        </button>
      </div>
    </div>
  );

  return (
    <div className="admin-shell min-h-screen lg:flex">
      {/* Barre mobile */}
      <div className="lg:hidden print:hidden flex items-center justify-between px-4 py-3 border-b bg-[#170f0e] sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="" width={32} height={32} className="rounded-full" />
          <span className="font-semibold text-white">Administration</span>
        </div>
        <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu" className="p-2 text-white">
          <Icon name="menu" />
        </button>
      </div>

      {/* Menu lateral */}
      <aside
        className={`print:hidden bg-[#170f0e] border-r lg:w-60 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen lg:block ${
          menuOpen ? "fixed inset-y-0 left-0 w-64 z-40 shadow-2xl" : "hidden"
        }`}
      >
        {sidebar}
      </aside>
      {menuOpen && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />}

      <div className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
        {inAccounting && (
          <nav className="print:hidden mb-6 flex gap-1.5 flex-wrap bg-[#1c1514] border rounded-xl p-1.5 text-sm">
            {ACCOUNTING_TABS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg ${
                  isActive(pathname, item) ? "bg-[#b3261e] text-white font-medium" : "text-[#a99b96] hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
        {children}
      </div>
    </div>
  );
}
