"use client";

import { useCallback, useEffect, useState } from "react";
import { StarsDisplay } from "@/components/Stars";
import { PointOfSale, fetchPointsOfSale } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";
import { AdminReview, RATING_LABELS, ReviewSummary, deleteReview, fetchAdminReviews, updateReview } from "@/lib/engage";

const REC: Record<string, string> = { yes: "Recommande", maybe: "Peut-etre", no: "Ne recommande pas" };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-2xl bg-[#1c1514] p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ReviewsAdminPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [rows, setRows] = useState<AdminReview[]>([]);
  const [replying, setReplying] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchPointsOfSale().then((l) => setStores(l.filter((s) => s.is_active)));
  }, []);

  const load = useCallback(async () => {
    const d = await fetchAdminReviews(storeId);
    setSummary(d.summary);
    setRows(d.results);
  }, [storeId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const shown = rating ? rows.filter((r) => r.service_rating === rating || r.quality_rating === rating) : rows;
  const recTotal = summary ? summary.recommend.yes + summary.recommend.maybe + summary.recommend.no : 0;

  async function patch(id: number, data: { is_published?: boolean; comment_hidden?: boolean; reply?: string }) {
    try {
      const updated = await updateReview(id, data);
      setRows((l) => l.map((r) => (r.id === id ? updated : r)));
      setReplying(null);
      load();
    } catch (e) {
      setMsg(apiErrorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Avis clients</h1>
          <p className="text-sm text-gray-500">Notes de 1 a 5 (1 = pas satisfait, 2 = moyen, 3 = bon, 4 = tres bon, 5 = excellent), sondage et commentaires.</p>
        </div>
        <select value={storeId ?? ""} onChange={(e) => setStoreId(e.target.value ? Number(e.target.value) : null)} className="border rounded-lg px-3 py-2">
          <option value="">Tous les points de vente</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Note globale" value={summary.overall != null ? `${summary.overall.toFixed(1)} / 5` : "-"} sub={`${summary.count} avis`} />
          <Stat label="Service" value={summary.service != null ? `${summary.service.toFixed(1)} / 5` : "-"} />
          <Stat label="Qualite" value={summary.quality != null ? `${summary.quality.toFixed(1)} / 5` : "-"} />
          <Stat label="Rapidite (sondage)" value={summary.speed != null ? `${summary.speed.toFixed(1)} / 5` : "-"} />
          <Stat label="Accueil (sondage)" value={summary.welcome != null ? `${summary.welcome.toFixed(1)} / 5` : "-"} />
        </div>
      )}
      {summary && recTotal > 0 && (
        <div className="border rounded-2xl bg-[#1c1514] p-4">
          <p className="text-sm text-gray-400 mb-2">Recommanderiez-vous nos services ? ({recTotal} reponses)</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
            <div className="bg-emerald-500" style={{ width: `${(summary.recommend.yes / recTotal) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(summary.recommend.maybe / recTotal) * 100}%` }} />
            <div className="bg-red-500" style={{ width: `${(summary.recommend.no / recTotal) * 100}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Oui {summary.recommend.yes} · Peut-etre {summary.recommend.maybe} · Non {summary.recommend.no}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {[0, 5, 4, 3, 2, 1].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            className={`px-3 py-1.5 rounded-full border text-sm ${rating === n ? "bg-[#b3261e] border-[#b3261e] text-white" : "hover:border-[#f5b942]"}`}
          >
            {n === 0 ? "Tous" : `${n} ★ ${RATING_LABELS[n]}`}
          </button>
        ))}
      </div>
      {msg && <p className="text-sm text-red-400">{msg}</p>}

      {shown.length === 0 ? (
        <p className="text-center text-gray-500 border rounded-2xl py-12">Aucun avis pour le moment.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id} className={`border rounded-2xl bg-[#1c1514] p-4 ${r.is_published ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {r.customer_name || "Client anonyme"} <span className="text-xs text-gray-500">· {r.point_of_sale_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString("fr-FR")}
                    {r.order_reference && ` · commande ${r.order_reference.slice(0, 8).toUpperCase()}`}
                    {r.customer_phone && ` · ${r.customer_phone}`}
                  </p>
                </div>
                {!r.is_published && <span className="text-xs bg-amber-500/15 text-amber-400 rounded-md px-2 py-1">Masque du site</span>}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mt-2 items-center">
                <span className="inline-flex items-center gap-2">Service <StarsDisplay value={r.service_rating} /></span>
                <span className="inline-flex items-center gap-2">Qualite <StarsDisplay value={r.quality_rating} /></span>
                {r.q_speed != null && <span className="text-gray-400">Rapidite {r.q_speed}/5</span>}
                {r.q_welcome != null && <span className="text-gray-400">Accueil {r.q_welcome}/5</span>}
                {r.q_recommend && <span className="text-gray-400">{REC[r.q_recommend]}</span>}
              </div>
              {r.dish && <p className="text-xs text-[#f5b942] mt-1">Plat / produit : {r.dish}</p>}
              {r.comment && (
                <p className={`text-sm mt-2 whitespace-pre-line ${r.comment_hidden ? "line-through text-gray-500" : ""}`}>{r.comment}</p>
              )}
              {r.comment_hidden && <p className="text-xs text-amber-400 mt-1">Commentaire retire du site (la note reste comptee).</p>}
              {r.reply && replying !== r.id && <p className="text-sm mt-2 border-l-2 border-[#f5b942] pl-3 text-gray-300">Reponse : {r.reply}</p>}

              {replying === r.id ? (
                <div className="mt-3 space-y-2">
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} className="w-full border rounded-lg px-3 py-2" placeholder="Votre reponse (visible sur le site)" />
                  <div className="flex gap-2">
                    <button onClick={() => patch(r.id, { reply: replyText })} className="bg-[#b3261e] text-white rounded-lg px-4 py-1.5 text-sm">
                      Publier la reponse
                    </button>
                    <button onClick={() => setReplying(null)} className="border rounded-lg px-4 py-1.5 text-sm">
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-3 text-sm">
                  <button
                    onClick={() => {
                      setReplying(r.id);
                      setReplyText(r.reply);
                    }}
                    className="border rounded-lg px-3 py-1"
                  >
                    {r.reply ? "Modifier la reponse" : "Repondre"}
                  </button>
                  {r.comment && (
                    <button onClick={() => patch(r.id, { comment_hidden: !r.comment_hidden })} className="border rounded-lg px-3 py-1">
                      {r.comment_hidden ? "Remettre le commentaire" : "Retirer le commentaire"}
                    </button>
                  )}
                  <button onClick={() => patch(r.id, { is_published: !r.is_published })} className="border rounded-lg px-3 py-1">
                    {r.is_published ? "Masquer l'avis entier" : "Afficher l'avis"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Supprimer definitivement cet avis ?")) return;
                      await deleteReview(r.id);
                      load();
                    }}
                    className="border border-red-500/40 text-red-400 rounded-lg px-3 py-1"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
