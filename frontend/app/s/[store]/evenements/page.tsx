"use client";

import { useEffect, useState } from "react";
import { useSite } from "@/components/site/SiteContext";
import { socialHref } from "@/components/SocialLinks";
import { Combo, fetchSiteCombos, submitComboRequest } from "@/lib/engage";

const money = (v: string | number) => new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(v)) + " FCFA";
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function occasionEmoji(o: string) {
  const s = o.toLowerCase();
  if (s.includes("anniv")) return "🎂";
  if (s.includes("soir") || s.includes("ami")) return "🎉";
  if (s.includes("week")) return "🌴";
  return "🎁";
}

function RequestForm({ combo, slug, onClose }: { combo: Combo; slug: string; onClose: () => void }) {
  const minDate = iso(new Date(Date.now() + combo.min_notice_hours * 3600 * 1000));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(minDate);
  const [guests, setGuests] = useState(10);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await submitComboRequest(slug, { combo: combo.id, customer_name: name, customer_phone: phone, event_date: date, guests, message });
      setDone(res.detail);
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d?.detail ?? (d && Object.values(d).flat().join(" ")) ?? "Envoi impossible, reessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-bold text-brand-dark text-lg">Reserver : {combo.name}</h2>
            <p className="text-sm text-gray-500">{money(combo.price)}{combo.serves ? ` · ${combo.serves}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none" aria-label="Fermer">×</button>
        </div>
        {done ? (
          <div className="text-center py-6">
            <p className="text-4xl mb-2">✅</p>
            <p className="font-medium text-brand-dark">{done}</p>
            <button onClick={onClose} className="mt-4 bg-brand text-white px-6 py-2 rounded-lg">Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 text-sm">
            <label className="block">
              <span className="block mb-1 font-medium">Votre nom *</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="block">
              <span className="block mb-1 font-medium">Telephone (WhatsApp) *</span>
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77 000 00 00" className="w-full border rounded-lg px-3 py-2" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block mb-1 font-medium">Date de l&apos;evenement *</span>
                <input required type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              </label>
              <label className="block">
                <span className="block mb-1 font-medium">Personnes *</span>
                <input required type="number" min={1} max={500} value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2" />
              </label>
            </div>
            {combo.weekend_only && <p className="text-xs text-amber-700">Ce combo est disponible uniquement le samedi et le dimanche.</p>}
            <p className="text-xs text-gray-500">Reservation au moins {combo.min_notice_hours} h a l&apos;avance.</p>
            <label className="block">
              <span className="block mb-1 font-medium">Precisions (facultatif)</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={600} placeholder="Heure, lieu de livraison, gateau, allergies..." className="w-full border rounded-lg px-3 py-2" />
            </label>
            {error && <p className="text-red-600">{error}</p>}
            <button disabled={busy} className="w-full bg-brand text-white py-3 rounded-lg font-semibold hover:bg-brand-dark disabled:opacity-50">
              {busy ? "Envoi..." : "Envoyer ma demande"}
            </button>
            <p className="text-xs text-gray-500 text-center">Aucun paiement maintenant : nous vous contactons pour confirmer.</p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function EventsPage() {
  const { site } = useSite();
  const [combos, setCombos] = useState<Combo[] | null>(null);
  const [selected, setSelected] = useState<Combo | null>(null);
  const wa = socialHref("whatsapp", site.social_links?.whatsapp);

  useEffect(() => {
    fetchSiteCombos(site.slug)
      .then(setCombos)
      .catch(() => setCombos([]));
  }, [site.slug]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-brand-dark">Combos &amp; evenements</h1>
        <p className="text-gray-600 text-sm mt-1">Anniversaire, soiree entre amis, special week-end... Choisissez une formule et reservez.</p>
      </div>

      {combos === null && <p className="text-center text-gray-500">Chargement...</p>}
      {combos && combos.length === 0 && (
        <p className="text-center text-gray-500 border rounded-xl py-10 bg-white">
          Aucune formule pour le moment.{wa && (
            <>
              {" "}<a href={wa} className="text-brand underline" target="_blank" rel="noopener noreferrer">Ecrivez-nous sur WhatsApp</a> pour une demande sur mesure.
            </>
          )}
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {combos?.map((c) => (
          <article key={c.id} className="bg-white border rounded-2xl overflow-hidden flex flex-col">
            <div className={`bg-gradient-to-br from-brand-light to-white flex items-center justify-center overflow-hidden ${c.image ? "" : "h-40"}`}>
              {c.image ? (
                // image affichee en entiere (texte du combo lisible en entier)
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt={c.name} className="w-full h-auto" />
              ) : (
                <span className="text-6xl">{occasionEmoji(c.occasion)}</span>
              )}
            </div>
            <div className="p-4 flex-1 flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {c.occasion && <span className="text-xs bg-brand-light text-brand-dark rounded-full px-2.5 py-0.5 font-medium">{c.occasion}</span>}
                {c.weekend_only && <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2.5 py-0.5">Week-end</span>}
                {c.ends_on && <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5">Jusqu&apos;au {new Date(c.ends_on + "T12:00").toLocaleDateString("fr-FR")}</span>}
              </div>
              <h2 className="font-bold text-brand-dark text-lg leading-tight">{c.name}</h2>
              {c.description && <p className="text-sm text-gray-600">{c.description}</p>}
              {c.includes && (
                <ul className="text-sm text-gray-700 space-y-0.5">
                  {c.includes.split("\n").filter(Boolean).map((l, i) => (
                    <li key={i}>✔ {l}</li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-2">
                <p className="text-xl font-bold text-brand">{money(c.price)}</p>
                {c.serves && <p className="text-xs text-gray-500">{c.serves}</p>}
                <button onClick={() => setSelected(c)} className="mt-3 w-full bg-brand text-white py-2.5 rounded-lg font-semibold hover:bg-brand-dark">
                  Reserver ce combo
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {selected && <RequestForm combo={selected} slug={site.slug} onClose={() => setSelected(null)} />}
    </div>
  );
}
