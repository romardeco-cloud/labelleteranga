"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSite } from "@/components/site/SiteContext";
import Image from "next/image";
import { Order, declarePayment, fetchOrder } from "@/lib/api";
import { PAYMENT_QR } from "@/lib/branding";
import { LoyaltyProgress } from "@/components/site/LoyaltyBanner";
import { LoyaltyStatus, fetchLoyalty } from "@/lib/engage";
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
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<"app" | "qr" | "number" | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    setIsMobile(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));
  }, []);
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  useEffect(() => {
    if (order?.status !== "paid" || !order.customer_phone || !site.loyalty?.enabled) return;
    fetchLoyalty(site.slug, order.customer_phone)
      .then(setLoyalty)
      .catch(() => {});
  }, [order?.status, order?.customer_phone, site.slug, site.loyalty?.enabled]);
  const [declareError, setDeclareError] = useState("");
  const [declaring, setDeclaring] = useState(false);

  // Ouverture automatique de l'application de paiement (une seule fois par commande)
  const payLink =
    order && (order.payment_method === "wave" || order.payment_method === "orange_money")
      ? merchantPayLink(site, order.payment_method, Number(order.total_amount))
      : null;
  const merchantNumber =
    order?.payment_method === "wave" ? site.wave_number : order?.payment_method === "orange_money" ? site.orange_number : "";
  const qr = order ? PAYMENT_QR[order.payment_method] : undefined;
  const choices = [
    payLink && { key: "app" as const, label: "Dans l'application" },
    qr && { key: "qr" as const, label: "Scanner le QR" },
    merchantNumber && { key: "number" as const, label: "Avec le numero" },
  ].filter(Boolean) as { key: "app" | "qr" | "number"; label: string }[];
  const activeMode = mode && choices.some((c) => c.key === mode) ? mode : (isMobile ? choices.find((c) => c.key === "app") : choices.find((c) => c.key === "qr"))?.key ?? choices[0]?.key;

  function copy(text: string, key: string) {
    try {
      navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  }

  async function submitDeclaration(e: React.FormEvent) {
    e.preventDefault();
    if (!reference) return;
    setDeclaring(true);
    setDeclareError("");
    try {
      setOrder(await declarePayment(reference, txnRef.trim() || "XXXX")); // reference facultative : XXXX si le client ne l'a pas
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
      {order && Number(order.tip_amount ?? 0) > 0 && (
        <p className="text-sm text-gray-600 -mt-4 mb-6">💚 Pourboire inclus : {new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(order.tip_amount))} FCFA. Merci !</p>
      )}
      {order && Number(order.discount_amount ?? 0) > 0 && (
        <p className="text-sm text-emerald-700 -mt-4 mb-6">🎁 {order.reward_label} : -{new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(order.discount_amount))} FCFA</p>
      )}
      {order && Number(order.discount_amount ?? 0) === 0 && order.reward_label && (
        <p className="text-sm text-emerald-700 -mt-4 mb-6">🎁 Recompense fidelite utilisee : {order.reward_label}</p>
      )}

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

      {isPaid && loyalty?.enabled && (
        <div className="bg-white border rounded-lg p-4 mb-6 text-left">
          <p className="font-medium text-brand-dark mb-2">💛 Votre carte fidelite</p>
          <LoyaltyProgress status={loyalty} />
        </div>
      )}

      {(isPaid || isCash) && order && (
        <Link
          href={`${base}/avis?order=${order.reference}`}
          className="block bg-brand-light border border-brand-accent/60 rounded-lg p-4 mb-6 text-brand-dark hover:bg-white transition"
        >
          <span className="font-medium">⭐ Donnez votre avis</span>
          <span className="block text-sm text-gray-600">Notez le service et la qualite : 1 minute, 3 petites questions.</span>
        </Link>
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
          <p className="text-brand-dark font-medium text-center">
            Derniere etape : payez {new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(order.total_amount))} FCFA
          </p>
          <p className="text-xs text-gray-500 text-center mt-0.5">Choisissez comment payer avec {PAYMENT_LABELS[order.payment_method]} :</p>
          {choices.length > 1 && (
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              {choices.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setMode(c.key)}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold ${activeMode === c.key ? "bg-brand text-white border-brand" : "bg-white text-gray-700 hover:border-brand"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {activeMode === "app" && payLink && (
            <div className="mt-3">
              <a href={payLink} className="block w-full text-center bg-brand text-white py-3 rounded-lg font-semibold hover:bg-brand-dark">
                Payer avec {PAYMENT_LABELS[order.payment_method]}
              </a>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Le lien ouvre directement l&apos;application{order.payment_method === "wave" ? " avec le compte marchand et le montant deja remplis" : " : saisissez le montant indique"}.
              </p>
            </div>
          )}

          {activeMode === "qr" && qr && (
            <div className="mt-3 text-center">
              <Image src={qr.src} alt={qr.alt} width={qr.width} height={qr.height} className="mx-auto max-h-80 w-auto rounded-lg border" />
              <p className="text-xs text-gray-500 mt-2">Ouvrez {PAYMENT_LABELS[order.payment_method]}, scannez ce code et payez le montant indique.</p>
            </div>
          )}

          {activeMode === "number" && merchantNumber && (
            <div className="mt-3 bg-white border rounded-lg p-3 space-y-2 text-sm">
              <p className="text-gray-600">Dans {PAYMENT_LABELS[order.payment_method]}, faites un envoi / paiement vers :</p>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-lg text-brand-dark">{merchantNumber}</span>
                <button type="button" onClick={() => copy(merchantNumber, "num")} className="text-xs border rounded px-2 py-1">
                  {copied === "num" ? "Copie !" : "Copier"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>
                  Montant : <strong>{new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(order.total_amount))} FCFA</strong>
                </span>
                <button type="button" onClick={() => copy(String(Math.round(Number(order.total_amount))), "amt")} className="text-xs border rounded px-2 py-1">
                  {copied === "amt" ? "Copie !" : "Copier"}
                </button>
              </div>
              <p className="text-xs text-gray-500">Indiquez le numero de commande <strong>{order.order_number}</strong> en motif si possible.</p>
            </div>
          )}

          <p className="text-xs text-gray-600 mt-3">Ensuite, revenez ici et validez le paiement (la reference de la transaction, recue par SMS, est facultative).</p>
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
              <label className="block text-sm font-medium">
                Reference de la transaction <span className="text-gray-400 font-normal">(facultatif - recue par SMS ou dans l&apos;application)</span>
              </label>
              <input
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
                placeholder="Ex. T2409181234AB  (ou laissez vide : XXXX)"
                className="w-full border rounded px-3 py-2"
              />
              <p className="text-xs text-gray-500">Vous n&apos;avez pas la reference sous la main ? Laissez vide : nous verifions votre paiement avec votre numero et le montant.</p>
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
