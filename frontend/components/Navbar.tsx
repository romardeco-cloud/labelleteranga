"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchCart } from "@/lib/api";

export default function Navbar() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetchCart()
      .then((cart) => setCount(cart.items.reduce((sum, i) => sum + i.quantity, 0)))
      .catch(() => setCount(0));
  }, []);

  return (
    <header className="bg-brand text-white sticky top-0 z-20 shadow">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight">
          La Belle Teranga
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/">Boutique</Link>
          <Link href="/cart" className="relative">
            Panier
            {count > 0 && (
              <span className="absolute -top-2 -right-4 bg-brand-accent text-brand-dark text-xs rounded-full px-1.5 py-0.5 font-bold">
                {count}
              </span>
            )}
          </Link>
          <Link href="/admin" className="opacity-80 hover:opacity-100">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
