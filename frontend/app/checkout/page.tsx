"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentMethod, createCashOrder, createCheckoutSession, getBrowserLocation } from "@/lib/api";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "card", label: "Carte bancaire", hint: "Visa, Mastercard via Stripe" },
  { value: "wave", label: "Wave", hint: "Paiement mobile Wave" },
  { value: "orange_money", label: "Orange Money", hint: "Paiement mobile Orange" },
  { value: "cash", label: "Especes", hint: "Paiement a la livraison" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    delivery_address: "",
  });
  const [method, setMethod] = useState<PaymentMethod>("wave");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      delivery_latitude: location?.lat ?? null,
      delivery_longitude: location?.lng ?? null,
    };

    try {
      if (method === "cash") {
        const order = await createCashOrder(customer);
        router.push(`/checkout/success?order=${order.reference}`);
        return;
      }
      const { checkout_url } = await createCheckoutSession(method, customer);
      window.location.href = checkout_url;
    } catch (err) {
      setError("Impossible de finaliser la commande. Verifiez votre panier et reessayez.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Finaliser la commande</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            required
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
        </div>
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

        <div>
          <label className="block text-sm font-medium mb-2">Moyen de paiement</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
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

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white py-3 rounded-lg font-medium hover:bg-brand-dark transition disabled:opacity-50"
        >
          {loading
            ? "Traitement en cours..."
            : method === "cash"
              ? "Valider la commande (paiement a la livraison)"
              : `Payer avec ${PAYMENT_METHODS.find((m) => m.value === method)?.label}`}
        </button>
      </form>
    </div>
  );
}
