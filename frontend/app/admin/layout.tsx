"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAdminToken, getAdminToken } from "@/lib/auth";

type NavItem = { href: string; label: string; exact?: boolean; match?: string[] };

// Onglet "Comptabilite" : regroupe tous les documents et etats financiers.
const ACCOUNTING_TABS: NavItem[] = [
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
  { href: "/admin", label: "Tableau de bord", exact: true },
  { href: "/admin/accounting", label: "Comptabilite", match: ACCOUNTING_PREFIXES },
  { href: "/admin/inventory", label: "Inventaire" },
  { href: "/admin/products", label: "Produits" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/orders", label: "Commandes" },
  { href: "/admin/cashiers", label: "Caissiers" },
  { href: "/admin/stores", label: "Points de vente" },
];

function isActive(pathname: string | null, item: NavItem) {
  if (!pathname) return false;
  if (item.match) return item.match.some((p) => pathname.startsWith(p));
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (!isLoginPage && !getAdminToken()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [isLoginPage, router]);

  if (isLoginPage) return <>{children}</>;
  if (!ready) return <p className="p-8">Verification...</p>;

  const inAccounting = ACCOUNTING_PREFIXES.some((p) => pathname?.startsWith(p));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="print:hidden mb-6">
        <div className="flex items-start justify-between gap-4">
          <nav className="flex gap-x-5 gap-y-2 text-sm font-medium flex-wrap">
            {MAIN_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(pathname, item) ? "text-brand" : "text-gray-500"}>
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={() => {
              clearAdminToken();
              router.push("/admin/login");
            }}
            className="text-sm text-red-500 whitespace-nowrap"
          >
            Deconnexion
          </button>
        </div>

        {inAccounting && (
          <nav className="mt-4 flex gap-1.5 flex-wrap bg-brand-light/60 border border-brand/10 rounded-lg p-1.5 text-sm">
            {ACCOUNTING_TABS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md ${
                  isActive(pathname, item) ? "bg-brand text-white font-medium" : "text-gray-700 hover:bg-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {children}
    </div>
  );
}
