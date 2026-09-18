"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSite } from "@/components/site/SiteContext";
import { Order, fetchOrder } from "@/lib/api";

const PAYMENT_LABELS: Record<string, string> = {
  card: "Carte bancaire",
  wave: "Wave",
  orange_money: "Orange Money",
  cash: "Especes a la livraison",
};

function SuccessContent() {
  const params = useSearchParams();
  const { site, base } = useSite();
  const reference = params.get("order");
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      try {
        const data = await fetchOrder(reference!);
        if (cancelled) return;
        setOrder(data);
        // paiement en ligne confirme, ou commande especes (statut change plus tard a la livraison) : on arrete
        if (data.status !== "pending" || data.payment_method === "cash") {
          clearInterval(interval);
        }
      } catch {
        // commande pas encore visible / erreur reseau, on reessaiera
      }
      attempts += 1;
      if (attempts >= 15) clearInterval(interval);
    }

    const interval = setInterval(poll, 2000);
    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reference]);

  if (!reference) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-brand-dark mb-2">Merci pour votre commande !</h1>
        <Link href={base || "/"} className="text-brand underline">
          Retour a la boutique
        </Link>
      </div>
    );
  }

  const isCash = order?.payment_method === "cash";
  const isPaid = order?.status === "paid";
  const isPending = !order || order.status === "pending";

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-brand-dark mb-2">Merci pour votre commande !</h1>
      <p className="text-gray-600 mb-1">
        Commande n° <strong>{order?.order_number ?? reference.slice(0, 8).toUpperCase()}</strong>
      </p>
      {order && <p className="text-gray-600 mb-6">Moyen de paiement : {PAYMENT_LABELS[order.payment_method]}</p>}

      {isPaid && (
        <div className="bg-brand-light border border-brand-accent/50 rounded-lg p-4 mb-6">
          <p className="text-brand-dark font-medium mb-1">Paiement confirme !</p>
          <p className="text-sm text-gray-600">
            {order?.whatsapp_status === "sent" ? (
              <>
                Une confirmation avec votre numero de commande <strong>{order?.order_number}</strong> vient d&apos;etre envoyee par WhatsApp au{" "}
                <span className="font-medium">{order?.customer_phone}</span>.
              </>
            ) : (
              <>
                Votre numero de commande : <strong>{order?.order_number}</strong>. La confirmation WhatsApp vous sera envoyee au{" "}
                <span className="font-medium">{order?.customer_phone}</span> par notre equipe.
              </>
            )}
          </p>
        </div>
      )}

      {isCash && isPending && (
        <div className="bg-brand-light border border-brand-accent/50 rounded-lg p-4 mb-6">
          <p className="text-brand-dark font-medium">Commande enregistree !</p>
          <p className="text-sm text-gray-600 mt-1">
            Vous payerez en especes {order?.fulfillment === "pickup" ? "au retrait" : "a la livraison"}. La confirmation
            WhatsApp vous sera envoyee une fois le paiement recu.
          </p>
        </div>
      )}

      {!isCash && isPending && (
        <p className="text-gray-500 mb-6">En attente de confirmation du paiement...</p>
      )}

      {order?.status === "failed" && <p className="text-red-500 mb-6">Le paiement a echoue. Vous pouvez reessayer.</p>}

      {order?.fulfillment === "pickup" && (
        <p className="text-sm text-gray-600 mb-6">
          A retirer chez <strong>{site.name}</strong>
          {site.address ? ` — ${site.address}` : ""}.
        </p>
      )}

      <Link href={base || "/"} className="text-brand underline">
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
