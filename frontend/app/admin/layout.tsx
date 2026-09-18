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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <nav className="flex gap-6 text-sm font-medium flex-wrap">
          <Link href="/admin" className={pathname === "/admin" ? "text-brand" : "text-gray-500"}>
            Tableau de bord
          </Link>
          <Link href="/admin/products" className={pathname?.startsWith("/admin/products") ? "text-brand" : "text-gray-500"}>
            Produits
          </Link>
          <Link href="/admin/promotions" className={pathname?.startsWith("/admin/promotions") ? "text-brand" : "text-gray-500"}>
            Promotions
          </Link>
          <Link href="/admin/orders" className={pathname?.startsWith("/admin/orders") ? "text-brand" : "text-gray-500"}>
            Commandes
          </Link>
          <Link href="/admin/closing" className={pathname?.startsWith("/admin/closing") ? "text-brand" : "text-gray-500"}>
            Cloture de caisse
          </Link>
          <Link href="/admin/cashiers" className={pathname?.startsWith("/admin/cashiers") ? "text-brand" : "text-gray-500"}>
            Caissiers
          </Link>
          <Link href="/admin/stores" className={pathname?.startsWith("/admin/stores") ? "text-brand" : "text-gray-500"}>
            Points de vente
          </Link>
        </nav>
        <button
          onClick={() => {
            clearAdminToken();
            router.push("/admin/login");
          }}
          className="text-sm text-red-500"
        >
          Deconnexion
        </button>
      </div>
      {children}
    </div>
  );
}
