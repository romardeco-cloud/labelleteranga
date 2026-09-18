"use client";

import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-red-600 mb-2">Paiement annule</h1>
      <p className="text-gray-600 mb-6">Votre commande n&apos;a pas ete finalisee.</p>
      <Link href="/cart" className="text-brand underline">
        Retour au panier
      </Link>
    </div>
  );
}
