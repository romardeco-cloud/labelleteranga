"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchCart } from "@/lib/api";

export default function Navbar() {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  const isPos = pathname?.startsWith("/caisse");
  const isAdmin = !!pathname?.startsWith("/admin") && pathname !== "/admin/login";

  useEffect(() => {
    if (isPos || isAdmin) return;
    fetchCart()
      .then((cart) => setCount(cart.items.reduce((sum, i) => sum + i.quantity, 0)))
      .catch(() => setCount(0));
  }, [isPos, isAdmin]);

  if (isAdmin) return null;

  if (isPos) {
    return (
      <header className="bg-brand text-white sticky top-0 z-20 shadow-md border-b-2 border-brand-accent print:hidden">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 py-2.5">
          <Image src="/logo.jpg" alt="La Belle Teranga" width={40} height={40} className="rounded-full ring-2 ring-brand-accent" />
          <span className="font-bold text-brand-accent">La Belle Teranga — Caisse</span>
        </div>
      </header>
    );
  }

  return (
    <header className="bg-brand text-white sticky top-0 z-20 shadow-md border-b-2 border-brand-accent">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-2.5">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt="La Belle Teranga"
            width={44}
            height={44}
            className="rounded-full ring-2 ring-brand-accent"
            priority
          />
          <span className="text-xl font-bold tracking-tight text-brand-accent hidden sm:inline">
            La Belle Teranga
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-brand-accent transition">
            Boutique
          </Link>
          <Link href="/cart" className="relative hover:text-brand-accent transition">
            Panier
            {count > 0 && (
              <span className="absolute -top-2 -right-4 bg-brand-accent text-brand-dark text-xs rounded-full px-1.5 py-0.5 font-bold">
                {count}
              </span>
            )}
          </Link>
          <Link href="/admin" className="opacity-80 hover:opacity-100 hover:text-brand-accent transition">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
