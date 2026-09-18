"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SuccessContent() {
  const params = useSearchParams();
  const order = params.get("order");

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-brand-dark mb-2">Merci pour votre commande !</h1>
      <p className="text-gray-600 mb-6">
        {order ? `Reference commande: ${order}` : "Votre paiement a ete confirme."}
      </p>
      <Link href="/" className="text-brand underline">
        Retour a la boutique
      </Link>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-16 text-center">Chargement...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
