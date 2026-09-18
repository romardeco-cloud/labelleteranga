"use client";

import { useState } from "react";
import { createCheckoutSession } from "@/lib/api";

export default function CheckoutPage() {
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    delivery_address: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { checkout_url } = await createCheckoutSession(form);
      window.location.href = checkout_url;
    } catch (err) {
      setError("Impossible de creer la session de paiement. Verifiez votre panier et reessayez.");
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
          <label className="block text-sm font-medium mb-1">Telephone</label>
          <input
            value={form.customer_phone}
            onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
            placeholder="+221 77 000 00 00"
            className="w-full border rounded px-3 py-2"
          />
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
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white py-3 rounded-lg font-medium hover:bg-brand-dark transition disabled:opacity-50"
        >
          {loading ? "Redirection vers Stripe..." : "Payer avec Stripe"}
        </button>
      </form>
    </div>
  );
}
