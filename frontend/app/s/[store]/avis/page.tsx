"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSite } from "@/components/site/SiteContext";
import { StarsDisplay, StarsInput } from "@/components/Stars";
import { fetchOrder } from "@/lib/api";
import { PublicReview, RATING_LABELS, ReviewSummary, fetchSiteReviews, submitReview } from "@/lib/engage";

const RECOMMEND = [
  { key: "yes", label: "Oui, sans hesiter" },
  { key: "maybe", label: "Peut-etre" },
  { key: "no", label: "Non" },
] as const;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function ReviewsContent() {
  const { site } = useSite();
  const params = useSearchParams();
  const orderRef = params.get("order") || "";
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [dishes, setDishes] = useState<string[]>([]);

  const [service, setService] = useState(0);
  const [quality, setQuality] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [welcome, setWelcome] = useState(0);
  const [recommend, setRecommend] = useState<"yes" | "maybe" | "no" | "">("");
  const [dish, setDish] = useState("");
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const load = () =>
    fetchSiteReviews(site.slug)
      .then((d) => {
        setSummary(d.summary);
        setReviews(d.reviews);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.slug]);

  useEffect(() => {
    if (!orderRef) return;
    fetchOrder(orderRef)
      .then((o) => {
        setName((cur) => cur || o.customer_name);
        setDishes(o.items.map((i) => (i as unknown as { product_name?: string }).product_name ?? i.product?.name ?? "").filter(Boolean));
      })
      .catch(() => {});
  }, [orderRef]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !quality) {
      setError("Merci de noter le service et la qualite (1 a 5 etoiles).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitReview(site.slug, {
        service_rating: service,
        quality_rating: quality,
        q_speed: speed || undefined,
        q_welcome: welcome || undefined,
        q_recommend: recommend,
        dish,
        comment,
        customer_name: name,
        order: orderRef || undefined,
      });
      setDone(true);
      load();
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d?.detail ?? (d && Object.values(d).flat().join(" ")) ?? "Envoi impossible, reessayez.");
    } finally {
      setBusy(false);
    }
  }

  const maxBar = Math.max(1, ...Object.values(summary?.distribution ?? { 1: 0 }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-brand-dark">Votre avis compte</h1>
        <p className="text-gray-600 text-sm mt-1">Aidez-nous a nous ameliorer : notez le service et la qualite de nos plats et produits.</p>
      </div>

      {summary && summary.count > 0 && (
        <section className="bg-white border rounded-2xl p-5 grid sm:grid-cols-[auto_1fr] gap-6 items-center">
          <div className="text-center">
            <p className="text-5xl font-bold text-brand-dark">{summary.overall?.toFixed(1)}</p>
            <StarsDisplay value={summary.overall} size={20} />
            <p className="text-xs text-gray-500 mt-1">{summary.count} avis</p>
          </div>
          <div className="space-y-1.5 text-sm">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="flex items-center gap-2">
                <span className="w-24 text-gray-600 text-xs">
                  {n} - {RATING_LABELS[n]}
                </span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#f5b942]" style={{ width: `${((summary.distribution[String(n)] ?? 0) / maxBar) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-xs text-gray-500">{summary.distribution[String(n)] ?? 0}</span>
              </div>
            ))}
            <div className="pt-2 grid grid-cols-2 gap-x-6 text-xs text-gray-600">
              <p>Service : <strong>{summary.service?.toFixed(1)}</strong>/5</p>
              <p>Qualite : <strong>{summary.quality?.toFixed(1)}</strong>/5</p>
              {summary.speed != null && <p>Rapidite : <strong>{summary.speed.toFixed(1)}</strong>/5</p>}
              {summary.welcome != null && <p>Accueil : <strong>{summary.welcome.toFixed(1)}</strong>/5</p>}
            </div>
          </div>
        </section>
      )}

      {done ? (
        <section className="bg-brand-light border border-brand-accent/50 rounded-2xl p-8 text-center">
          <p className="text-3xl mb-2">🙏</p>
          <h2 className="text-xl font-bold text-brand-dark">Merci pour votre avis !</h2>
          <p className="text-sm text-gray-600 mt-1">Il nous aide a mieux vous servir.</p>
        </section>
      ) : (
        <form onSubmit={submit} className="bg-white border rounded-2xl p-5 sm:p-6 space-y-6">
          <h2 className="font-semibold text-brand-dark text-lg">Donner mon avis</h2>

          <div className="grid sm:grid-cols-2 gap-6">
            <div>
              <p className="font-medium text-sm mb-1">Le service *</p>
              <StarsInput value={service} onChange={setService} label="Note du service" />
            </div>
            <div>
              <p className="font-medium text-sm mb-1">La qualite des plats / produits *</p>
              <StarsInput value={quality} onChange={setQuality} label="Note de la qualite" />
            </div>
          </div>

          <fieldset className="border rounded-xl p-4 space-y-4 bg-gray-50/60">
            <legend className="px-2 text-sm font-semibold text-brand-dark">Petit sondage (3 questions)</legend>
            <div>
              <p className="text-sm mb-1">1. La rapidite du service vous a-t-elle satisfait ?</p>
              <StarsInput value={speed} onChange={setSpeed} size={28} label="Rapidite" />
            </div>
            <div>
              <p className="text-sm mb-1">2. L&apos;accueil et l&apos;amabilite de l&apos;equipe ?</p>
              <StarsInput value={welcome} onChange={setWelcome} size={28} label="Accueil" />
            </div>
            <div>
              <p className="text-sm mb-2">3. Recommanderiez-vous {site.name.replace(/ La Belle Teranga$/i, "")} a vos proches ?</p>
              <div className="flex flex-wrap gap-2">
                {RECOMMEND.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRecommend(recommend === r.key ? "" : r.key)}
                    className={`px-4 py-2 rounded-full border text-sm ${recommend === r.key ? "bg-brand text-white border-brand" : "bg-white hover:border-brand"}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="text-sm block">
              <span className="block mb-1 font-medium">Plat / produit concerne (facultatif)</span>
              <input value={dish} onChange={(e) => setDish(e.target.value)} list="dishes" placeholder="Ex. Poulet frit" className="w-full border rounded-lg px-3 py-2" />
              <datalist id="dishes">
                {dishes.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <label className="text-sm block">
              <span className="block mb-1 font-medium">Votre prenom (facultatif)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="w-full border rounded-lg px-3 py-2" />
            </label>
          </div>
          <label className="text-sm block">
            <span className="block mb-1 font-medium">Votre commentaire sur le service et les plats</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ce que vous avez aime, ce que nous pouvons ameliorer..."
              className="w-full border rounded-lg px-3 py-2"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={busy} className="w-full sm:w-auto bg-brand text-white px-8 py-3 rounded-lg font-semibold hover:bg-brand-dark disabled:opacity-50">
            {busy ? "Envoi..." : "Envoyer mon avis"}
          </button>
        </form>
      )}

      {reviews.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-brand-dark text-lg">Ce que disent nos clients</h2>
          {reviews.map((r) => (
            <article key={r.id} className="bg-white border rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-gray-500">{fmtDate(r.created_at)}</p>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600 mt-1">
                <span className="inline-flex items-center gap-1">
                  Service <StarsDisplay value={r.service_rating} size={14} />
                </span>
                <span className="inline-flex items-center gap-1">
                  Qualite <StarsDisplay value={r.quality_rating} size={14} />
                </span>
              </div>
              {r.dish && <p className="text-xs text-brand mt-1">A propos de : {r.dish}</p>}
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">{r.comment}</p>
              {r.reply && (
                <p className="text-sm mt-3 bg-brand-light border-l-4 border-brand-accent rounded px-3 py-2">
                  <strong>Reponse de {site.name.replace(/ La Belle Teranga$/i, "")} :</strong> {r.reply}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-16 text-center">Chargement...</div>}>
      <ReviewsContent />
    </Suspense>
  );
}
