"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clearAdminToken, getAdminToken } from "@/lib/auth";

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

  const links: [string, string, boolean?][] = [
    ["/admin", "Tableau de bord", true],
    ["/admin/reports", "Rapports"],
    ["/admin/documents/quotes", "Devis"],
    ["/admin/documents/invoices", "Factures"],
    ["/admin/documents/purchase-orders", "Bons de commande"],
    ["/admin/contacts", "Clients / Fournisseurs"],
    ["/admin/products", "Produits"],
    ["/admin/promotions", "Promotions"],
    ["/admin/orders", "Commandes"],
    ["/admin/closing", "Cloture de caisse"],
    ["/admin/cashiers", "Caissiers"],
    ["/admin/stores", "Points de vente"],
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between gap-4 mb-6 print:hidden">
        <nav className="flex gap-x-5 gap-y-2 text-sm font-medium flex-wrap">
          {links.map(([href, label, exact]) => {
            const active = exact ? pathname === href : pathname?.startsWith(href);
            return (
              <Link key={href} href={href} className={active ? "text-brand" : "text-gray-500"}>
                {label}
              </Link>
            );
          })}
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
      {children}
    </div>
  );
}
