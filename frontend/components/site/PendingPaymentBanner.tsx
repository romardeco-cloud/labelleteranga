"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSite } from "@/components/site/SiteContext";
import { fetchOrder } from "@/lib/api";

/** Rappel sur tout le site : une commande payee par QR/lien attend la validation du paiement par le client. */
export default function PendingPaymentBanner() {
  const { site, base } = useSite();
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    let ref: string | null = null;
    try {
      ref = localStorage.getItem(`lbt_pending_pay_${site.slug}`);
    } catch {}
    if (!ref) return;
    fetchOrder(ref)
      .then((o) => {
        const waiting = o.status === "pending" && !o.payment_declared_at && (o.payment_method === "wave" || o.payment_method === "orange_money");
        if (waiting) setReference(ref);
        else localStorage.removeItem(`lbt_pending_pay_${site.slug}`);
      })
      .catch(() => localStorage.removeItem(`lbt_pending_pay_${site.slug}`));
  }, [site.slug]);

  if (!reference) return null;
  return (
    <Link href={`${base}/checkout/success?order=${reference}`} className="block bg-brand-accent text-brand-dark text-center text-sm font-medium py-2 px-4">
      Vous avez un paiement a valider : touchez ici pour terminer votre commande
    </Link>
  );
}
