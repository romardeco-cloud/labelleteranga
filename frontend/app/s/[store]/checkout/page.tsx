"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSite } from "@/components/site/SiteContext";
import { LoyaltyProgress, loyaltyRule } from "@/components/site/LoyaltyBanner";
import { LoyaltyStatus, fetchLoyalty } from "@/lib/engage";
import { PaymentMethod, createCashOrder, createCheckoutSession, createManualOrder, getBrowserLocation } from "@/lib/api";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "card", label: "Carte bancaire", hint: "Visa, Mastercard via Stripe" },
  { value: "wave", label: "Wave", hint: "Payez avec le QR code Wave" },
  { value: "orange_money", label: "Orange Money", hint: "Payez avec le QR code Orange Money" },
  { value: "cash", label: "Especes", hint: "Paiement a la livraison ou au retrait" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { site, base } = useSite();
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const methods = PAYMENT_METHODS.filter((m) => site.payment_methods.includes(m.value));
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    delivery_address: "",
  });
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  const [useReward, setUseReward] = useState(true);
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lbt_phone");
      if (saved) setForm((f) => (f.customer_phone ? f : { ...f, customer_phone: saved }));
    } catch {}
  }, []);

  // programme de fidelite : on consulte le statut du client des que son numero est complet
  useEffect(() => {
    if (!site.loyalty?.enabled || form.customer_phone.replace(/\D/g, "").length < 8) {
      setLoyalty(null);
      return;
    }
    const t = setTimeout(() => {
      fetchLoyalty(site.slug, form.customer_phone)
        .then(setLoyalty)
        .catch(() => setLoyalty(null));
    }, 500);
    return () => clearTimeout(t);
  }, [form.customer_phone, site.slug, site.loyalty?.enabled]);

  const availableReward = loyalty?.member?.rewards?.[0] ?? null;

  async function handleShareLocation() {
    setLocating(true);
    const pos = await getBrowserLocation();
    setLocation(pos);
    setLocating(false);
    if (!pos) {
      setError("Impossible de recuperer votre position. Verifiez l'autorisation de localisation du navigateur.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const customer = {
      ...form,
      fulfillment,
      delivery_address: fulfillment === "pickup" ? `A emporter - ${site.name}` : form.delivery_address,
      delivery_latitude: location?.lat ?? null,
      delivery_longitude: location?.lng ?? null,
      use_reward: !!availableReward && useReward,
      tip_amount: tip > 0 ? tip : undefined,
    };

    try {
      if (method === "cash") {
        const order = await createCashOrder(customer);
        router.push(`${base}/checkout/success?order=${order.reference}`);
        return;
      }
      if (method !== "card" && site.manual_payment_methods?.includes(method)) {
        const order = await createManualOrder(method, customer);
        try {
          localStorage.setItem(`lbt_pending_pay_${site.slug}`, order.reference);
        } catch {}
        router.push(`${base}/checkout/success?order=${order.reference}`);
        return;
      }
      const { checkout_url } = await createCheckoutSession(method, customer);
      window.location.href = checkout_url;
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Impossible de finaliser la commande. Verifiez votre panier et reessayez."
      );
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Finaliser la commande</h1>
      <p className="text-sm text-gray-500 mb-6">{site.name}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["delivery", "Livraison", "Chez vous"],
              ["pickup", "A emporter", `Retrait : ${site.address || "au point de vente"}`],
            ] as const
          ).map(([key, label, hint]) => (
            <button
              type="button"
              key={key}
              onClick={() => setFulfillment(key)}
              className={`text-left border rounded-lg px-3 py-2 transition ${
                fulfillment === key ? "border-brand bg-brand-light ring-1 ring-brand" : "border-gray-200 hover:border-brand/50"
              }`}
            >
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-gray-500 line-clamp-2">{hint}</span>
            </button>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Nom complet</label>
          <input
            required
            value={form.customer_name}
            onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Email <span className="text-gray-400 font-normal">(facultatif)</span>
          </label>
          <input
            type="email"
            value={form.customer_email}
            onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Telephone (WhatsApp)</label>
          <input
            required
            value={form.customer_phone}
            onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
            placeholder="221770000000"
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-400 mt-1">
            Utilise pour Wave / Orange Money et pour vous envoyer la confirmation WhatsApp.
          </p>
          {site.loyalty?.enabled && (
            <div className="mt-3 rounded-lg border border-brand-accent/60 bg-brand-light p-3 text-sm">
              {availableReward ? (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} className="mt-1" />
                  <span>
                    🎁 <strong>Utiliser ma recompense fidelite</strong> : {availableReward.label}
                  </span>
                </label>
              ) : loyalty ? (
                <LoyaltyProgress status={loyalty} />
              ) : (
                <p className="text-gray-700">💛 Carte fidelite : {loyaltyRule(site.loyalty)}</p>
              )}
            </div>
          )}
        </div>
        {fulfillment === "delivery" && (
        <div>
          <label className="block text-sm font-medium mb-1">Adresse de livraison</label>
          <textarea
            required
            value={form.delivery_address}
            onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
            className="w-full border rounded px-3 py-2"
            rows={3}
          />
          <button
            type="button"
            onClick={handleShareLocation}
            disabled={locating}
            className="mt-2 text-sm text-brand hover:underline disabled:opacity-50"
          >
            {locating ? "Localisation en cours..." : location ? "Position GPS ajoutee" : "Partager ma position GPS (optionnel)"}
          </button>
        </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-2">Moyen de paiement</label>
          <div className="grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <button
                type="button"
                key={m.value}
                onClick={() => setMethod(m.value)}
                className={`text-left border rounded-lg px-3 py-2 transition ${
                  method === m.value
                    ? "border-brand bg-brand-light ring-1 ring-brand"
                    : "border-gray-200 hover:border-brand/50"
                }`}
              >
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="block text-xs text-gray-500">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Pourboire (facultatif)</label>
          <p className="text-xs text-gray-500 mb-2">Un geste pour remercier l&apos;equipe : vous choisissez librement le montant.</p>
          <div className="flex flex-wrap gap-2">
            {[0, 500, 1000, 2000].map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => {
                  setTip(v);
                  setCustomTip("");
                }}
                className={`px-3 py-1.5 rounded-full border text-sm ${tip === v && !customTip ? "bg-brand text-white border-brand" : "bg-white hover:border-brand"}`}
              >
                {v === 0 ? "Aucun" : `${v.toLocaleString("fr-FR")} FCFA`}
              </button>
            ))}
            <input
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              value={customTip}
              onChange={(e) => {
                setCustomTip(e.target.value);
                setTip(Math.max(0, Math.round(Number(e.target.value) || 0)));
              }}
              placeholder="Autre montant"
              className="w-36 border rounded-full px-3 py-1.5 text-sm"
            />
          </div>
          {tip > 0 && <p className="text-xs text-emerald-700 mt-2">Merci ! {tip.toLocaleString("fr-FR")} FCFA de pourboire seront ajoutes au total a payer.</p>}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white py-3 rounded-lg font-medium hover:bg-brand-dark transition disabled:opacity-50"
        >
          {loading
            ? "Traitement en cours..."
            : method === "cash"
              ? fulfillment === "pickup"
                ? "Valider la commande (paiement au retrait)"
                : "Valider la commande (paiement a la livraison)"
              : site.manual_payment_methods?.includes(method as "wave" | "orange_money")
                ? `Commander et payer par ${PAYMENT_METHODS.find((m) => m.value === method)?.label}`
                : `Payer avec ${PAYMENT_METHODS.find((m) => m.value === method)?.label}`}
        </button>
      </form>
    </div>
  );
}
