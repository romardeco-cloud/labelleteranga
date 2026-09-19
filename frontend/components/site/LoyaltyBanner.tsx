"use client";

import { useEffect, useState } from "react";
import { useSite } from "@/components/site/SiteContext";
import { LoyaltyStatus, fetchLoyalty } from "@/lib/engage";

const money = (v: number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(v) + " FCFA";

/** Phrase decrivant la regle : "Toutes les 10 commandes : Reduction de 10 %". */
export function loyaltyRule(l: { mode?: string; threshold?: number; reward_label?: string }) {
  const goal = l.mode === "amount" ? `Chaque ${money(l.threshold ?? 0)} d'achats` : `Toutes les ${l.threshold} commandes`;
  return `${goal} : ${l.reward_label}`;
}

/** Progression d'un client dans le programme (barre + recompenses disponibles). */
export function LoyaltyProgress({ status }: { status: LoyaltyStatus }) {
  const m = status.member;
  if (!m) return <p className="text-sm text-gray-600">Aucun achat enregistre avec ce numero pour l&apos;instant : votre premiere commande lance votre carte !</p>;
  const pct = Math.min(100, (m.progress / status.threshold) * 100);
  const left = Math.max(0, status.threshold - m.progress);
  return (
    <div className="space-y-2 text-sm">
      <p>
        <strong>{m.orders_count}</strong> commande{m.orders_count > 1 ? "s" : ""} enregistree{m.orders_count > 1 ? "s" : ""}
      </p>
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-gray-600">
        {status.mode === "amount" ? `Encore ${money(left)} d'achats` : `Encore ${Math.ceil(left)} commande${Math.ceil(left) > 1 ? "s" : ""}`} pour obtenir : <strong>{status.reward_label}</strong>
      </p>
      {m.rewards.length > 0 && (
        <p className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
          🎁 {m.rewards.length} recompense{m.rewards.length > 1 ? "s" : ""} disponible{m.rewards.length > 1 ? "s" : ""} : {m.rewards[0].label}. Elle sera appliquee
          a votre prochaine commande en ligne (ou presentez votre numero en caisse).
        </p>
      )}
    </div>
  );
}

export default function LoyaltyBanner() {
  const { site } = useSite();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<LoyaltyStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lbt_phone");
      if (saved) setPhone(saved);
    } catch {}
  }, []);

  if (!site.loyalty?.enabled) return null;

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setStatus(await fetchLoyalty(site.slug, phone));
      try {
        localStorage.setItem("lbt_phone", phone);
      } catch {}
    } catch {
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-brand-accent/60 bg-gradient-to-r from-brand-light to-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-brand-dark text-lg">💛 Carte fidelite</h2>
          <p className="text-sm text-gray-700">{loyaltyRule(site.loyalty)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Renseignez votre numero de telephone a la commande (ou en caisse) : c&apos;est automatique.</p>
        </div>
        <form onSubmit={check} className="flex gap-2 w-full sm:w-auto">
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Mon numero"
            className="border rounded-lg px-3 py-2 text-sm flex-1 sm:w-44"
          />
          <button disabled={busy} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? "..." : "Mes points"}
          </button>
        </form>
      </div>
      {status && (
        <div className="mt-4 border-t pt-4">
          <LoyaltyProgress status={status} />
        </div>
      )}
    </section>
  );
}
