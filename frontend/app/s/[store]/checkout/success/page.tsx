"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSite } from "@/components/site/SiteContext";
import Image from "next/image";
import { Order, declarePayment, fetchOrder } from "@/lib/api";
import { PAYMENT_QR } from "@/lib/branding";
import { merchantPayLink } from "@/lib/site";

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
  const [txnRef, setTxnRef] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => {
    setIsMobile(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));
  }, []);
  const [declareError, setDeclareError] = useState("");
  const [declaring, setDeclaring] = useState(false);

  // Ouverture automatique de l'application de paiement (une seule fois par commande)
  const payLink =
    order && (order.payment_method === "wave" || order.payment_method === "orange_money")
      ? merchantPayLink(site, order.payment_method, Number(order.total_amount))
      : null;
  useEffect(() => {
    if (!order || !payLink || order.status !== "pending" || order.payment_declared_at) return;
    const key = `lbt_paylink_opened_${order.reference}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    setRedirecting(true);
    const t = setTimeout(() => {
      window.location.href = payLink;
    }, 1800);
    return () => clearTimeout(t);
  }, [order, payLink]);

  async function submitDeclaration(e: React.FormEvent) {
    e.preventDefault();
    if (!reference) return;
    setDeclaring(true);
    setDeclareError("");
    try {
      setOrder(await declarePayment(reference, txnRef));
    } catch (err: any) {
      setDeclareError(err?.response?.data?.detail ?? "Validation impossible, reessayez.");
    } finally {
      setDeclaring(false);
    }
  }

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
  const isManual = !!order && (site.manual_payment_methods as string[] | undefined)?.includes(order.payment_method);
  const isPaid = order?.status === "paid";
  const isPending = !order || order.status === "pending";

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-brand-dark mb-2">
        {isManual && isPending && !order?.payment_declared_at ? "Finalisez votre paiement" : "Merci pour votre commande !"}
      </h1>
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

      {isManual && isPending && order && !order.payment_declared_at && (
        <div className="bg-brand-light border border-brand-accent/50 rounded-lg p-4 mb-6 text-left">
          <p className="text-brand-dark font-medium text-center">Derniere etape : payez {new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(order.total_amount))} FCFA</p>
          {payLink && (
            <a
              href={payLink}
              className="mt-3 block w-full text-center bg-brand text-white py-3 rounded-lg font-semibold hover:bg-brand-dark"
            >
              {redirecting ? `Ouverture de ${PAYMENT_LABELS[order.payment_method]}...` : `Payer maintenant avec ${PAYMENT_LABELS[order.payment_method]}`}
            </a>
          )}
          <p className="text-xs text-gray-500 mt-1 text-center">
            Le compte marchand{order.payment_method === "wave" ? " et le montant sont deja remplis" : " est deja rempli : saisissez le montant indique"}.
          </p>
          <ol className="text-sm text-gray-700 mt-3 list-decimal list-inside space-y-1">
            <li>{payLink ? `Payez dans l'application ${PAYMENT_LABELS[order.payment_method]} (inutile de scanner : le lien ouvre directement l'application).` : `Ouvrez ${PAYMENT_LABELS[order.payment_method]} et scannez le code ci-dessous.`}</li>
            <li>
              Payez exactement le montant indique et indiquez le numero de commande <strong>{order.order_number}</strong> si l&apos;application le permet.
            </li>
            <li>Revenez ici et validez votre paiement avec la reference de la transaction.</li>
          </ol>
          {payLink && isMobile && !showQr && (
            <button type="button" onClick={() => setShowQr(true)} className="block mx-auto mt-2 text-xs text-gray-500 underline">
              Afficher le code QR
            </button>
          )}
          {PAYMENT_QR[order.payment_method] && (!payLink || !isMobile || showQr) && (
            <Image
              src={PAYMENT_QR[order.payment_method].src}
              alt={PAYMENT_QR[order.payment_method].alt}
              width={PAYMENT_QR[order.payment_method].width}
              height={PAYMENT_QR[order.payment_method].height}
              className="mx-auto mt-3 max-h-80 w-auto rounded-lg border"
            />
          )}
        </div>
      )}

      {isManual && isPending && order && (
        <div className="mb-6 text-left">
          {order.payment_declared_at ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-green-800 font-medium">Paiement declare, merci !</p>
              <p className="text-sm text-gray-600 mt-1">
                Reference : <strong>{order.payment_reference}</strong>. Nous verifions votre paiement, puis vous recevez la confirmation par
                WhatsApp au {order.customer_phone}.
              </p>
            </div>
          ) : (
            <form onSubmit={submitDeclaration} className="border rounded-lg p-4 bg-white space-y-2">
              <label className="block text-sm font-medium">Reference de la transaction (recue par SMS ou dans l&apos;application)</label>
              <input
                required
                minLength={4}
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                placeholder="Ex. T2409181234AB"
                className="w-full border rounded px-3 py-2"
              />
              {declareError && <p className="text-sm text-red-600">{declareError}</p>}
              <button disabled={declaring} className="w-full bg-brand text-white py-2.5 rounded-lg font-medium disabled:opacity-50">
                {declaring ? "Validation..." : "J'ai effectue le paiement - valider"}
              </button>
              <p className="text-xs text-gray-500">
                Votre commande ne sera traitee et la confirmation WhatsApp envoyee qu&apos;apres cette validation et la verification de votre paiement.
              </p>
            </form>
          )}
        </div>
      )}

      {!isCash && !isManual && isPending && (
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
