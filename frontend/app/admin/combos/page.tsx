"use client";

import { useCallback, useEffect, useState } from "react";
import { PointOfSale, fetchPointsOfSale } from "@/lib/api";
import { apiErrorMessage, formatXof } from "@/lib/documents";
import { Combo, ComboRequestRow, deleteCombo, fetchComboRequests, fetchCombosAdmin, saveCombo, setComboRequestStatus, syncComboPrices, SyncPricesResult } from "@/lib/engage";
import { socialHref } from "@/components/SocialLinks";

const OCCASIONS = ["Anniversaire", "Soiree entre amis", "Special week-end", "Special evenement", "Mariage / bapteme", "Repas d'entreprise"];

type Draft = {
  id: number | null;
  name: string;
  occasion: string;
  description: string;
  includes: string;
  serves: string;
  price: string;
  weekend_only: boolean;
  starts_on: string;
  ends_on: string;
  min_notice_hours: string;
  is_active: boolean;
  order: string;
  image: string | null;
  file: File | null;
  removeImage: boolean;
};

const empty: Draft = {
  id: null, name: "", occasion: "", description: "", includes: "", serves: "", price: "", weekend_only: false, starts_on: "", ends_on: "",
  min_notice_hours: "24", is_active: true, order: "0", image: null, file: null, removeImage: false,
};

const STATUS: Record<ComboRequestRow["status"], { label: string; cls: string }> = {
  new: { label: "Nouvelle", cls: "bg-amber-500/15 text-amber-400" },
  confirmed: { label: "Confirmee", cls: "bg-emerald-500/15 text-emerald-400" },
  cancelled: { label: "Annulee", cls: "bg-red-500/15 text-red-400" },
};

export default function CombosAdminPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [tab, setTab] = useState<"combos" | "requests">("combos");
  const [combos, setCombos] = useState<Combo[]>([]);
  const [requests, setRequests] = useState<ComboRequestRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sync, setSync] = useState<SyncPricesResult | null>(null);
  const [syncActivate, setSyncActivate] = useState(false);

  useEffect(() => {
    fetchPointsOfSale().then((list) => {
      const active = list.filter((s) => s.is_active);
      setStores(active);
      setStoreId((cur) => cur ?? active.find((s) => s.slug === "resto")?.id ?? active[0]?.id ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!storeId) return;
    setCombos(await fetchCombosAdmin(storeId));
    setRequests(await fetchComboRequests(storeId));
  }, [storeId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const edit = (c: Combo) =>
    setDraft({
      id: c.id, name: c.name, occasion: c.occasion, description: c.description, includes: c.includes, serves: c.serves, price: String(Number(c.price)),
      weekend_only: c.weekend_only, starts_on: c.starts_on ?? "", ends_on: c.ends_on ?? "", min_notice_hours: String(c.min_notice_hours),
      is_active: c.is_active, order: String(c.order), image: c.image, file: null, removeImage: false,
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !storeId) return;
    setBusy(true);
    setMsg("");
    try {
      const f = new FormData();
      f.append("point_of_sale", String(storeId));
      f.append("name", draft.name);
      f.append("occasion", draft.occasion);
      f.append("description", draft.description);
      f.append("includes", draft.includes);
      f.append("serves", draft.serves);
      f.append("price", draft.price || "0");
      f.append("weekend_only", String(draft.weekend_only));
      f.append("starts_on", draft.starts_on);
      f.append("ends_on", draft.ends_on);
      f.append("min_notice_hours", draft.min_notice_hours || "0");
      f.append("is_active", String(draft.is_active));
      f.append("order", draft.order || "0");
      if (draft.file) f.append("image", draft.file);
      if (draft.removeImage) f.append("remove_image", "true");
      await saveCombo(draft.id, f);
      setDraft(null);
      load();
    } catch (err) {
      setMsg(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyPrices() {
    if (!storeId) return;
    if (!confirm("Appliquer le prix de chaque combo au produit du meme nom (ex. « Combo Box Senegalaise ») dans ce point de vente ?")) return;
    setBusy(true);
    setSync(null);
    try {
      setSync(await syncComboPrices(storeId, syncActivate));
    } catch (err) {
      setMsg(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const newCount = requests.filter((r) => r.status === "new").length;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Combos &amp; evenements</h1>
          <p className="text-sm text-gray-500">Creez vos formules (anniversaire, soiree entre amis, special week-end...) ; les clients les reservent depuis le site.</p>
        </div>
        <select value={storeId ?? ""} onChange={(e) => setStoreId(Number(e.target.value))} className="border rounded-lg px-3 py-2">
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab("combos")} className={`px-4 py-2 rounded-lg border ${tab === "combos" ? "bg-[#b3261e] border-[#b3261e] text-white" : ""}`}>
          Mes combos ({combos.length})
        </button>
        <button onClick={() => setTab("requests")} className={`px-4 py-2 rounded-lg border ${tab === "requests" ? "bg-[#b3261e] border-[#b3261e] text-white" : ""}`}>
          Demandes de reservation {newCount > 0 && <span className="ml-1 bg-amber-400 text-black rounded-full px-2 text-xs font-bold">{newCount}</span>}
        </button>
      </div>

      {tab === "combos" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setDraft({ ...empty })} className="bg-[#b3261e] text-white rounded-lg px-4 py-2 font-medium">
              + Nouveau combo
            </button>
            <button onClick={applyPrices} disabled={busy} className="border border-[#f5b942] text-[#f5b942] rounded-lg px-4 py-2 font-medium disabled:opacity-50">
              Appliquer les prix aux produits
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input type="checkbox" checked={syncActivate} onChange={(e) => setSyncActivate(e.target.checked)} /> Activer aussi les produits
            </label>
          </div>
          {sync && (
            <div className="border rounded-2xl bg-[#1c1514] p-4 text-sm space-y-2">
              <p className="font-semibold">
                {sync.updated.length} produit{sync.updated.length > 1 ? "s" : ""} mis a jour
                {sync.unchanged.length > 0 && ` · ${sync.unchanged.length} deja au bon prix`}
              </p>
              {sync.updated.length > 0 && (
                <ul className="space-y-0.5 text-gray-300">
                  {sync.updated.map((u) => (
                    <li key={u.product}>
                      {u.product} : {formatXof(u.old_price)} → <strong className="text-emerald-400">{formatXof(u.new_price)}</strong>
                      {u.activated && <span className="ml-2 text-xs text-emerald-400">(active)</span>}
                    </li>
                  ))}
                </ul>
              )}
              {sync.no_price.length > 0 && <p className="text-amber-400">Sans prix (a saisir dans le combo) : {sync.no_price.join(", ")}</p>}
              {sync.no_product.length > 0 && <p className="text-gray-400">Pas de produit du meme nom dans ce point de vente : {sync.no_product.join(", ")}</p>}
              {sync.shared.length > 0 && <p className="text-gray-400">Non modifies (produit partage avec un autre point de vente) : {sync.shared.join(", ")}</p>}
            </div>
          )}
          {combos.length === 0 ? (
            <p className="text-center text-gray-500 border rounded-2xl py-12">Aucun combo. Creez votre premiere formule.</p>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {combos.map((c) => (
                <article key={c.id} className={`border rounded-2xl bg-[#1c1514] overflow-hidden ${c.is_active ? "" : "opacity-60"}`}>
                  {c.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt={c.name} className="h-36 w-full object-cover" />
                  )}
                  <div className="p-4 space-y-1">
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {c.occasion && <span className="bg-white/10 rounded-full px-2 py-0.5">{c.occasion}</span>}
                      {c.weekend_only && <span className="bg-amber-500/15 text-amber-400 rounded-full px-2 py-0.5">Week-end</span>}
                      {!c.is_active && <span className="bg-red-500/15 text-red-400 rounded-full px-2 py-0.5">Masque</span>}
                    </div>
                    <h2 className="font-semibold">{c.name}</h2>
                    <p className="text-[#f5b942] font-bold">{formatXof(c.price)}</p>
                    {c.serves && <p className="text-xs text-gray-500">{c.serves}</p>}
                    <div className="flex gap-2 pt-2 text-sm">
                      <button onClick={() => edit(c)} className="border rounded-lg px-3 py-1">Modifier</button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Supprimer le combo "${c.name}" ?`)) return;
                          await deleteCombo(c.id);
                          load();
                        }}
                        className="border border-red-500/40 text-red-400 rounded-lg px-3 py-1"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "requests" && (
        <div className="space-y-3">
          {requests.length === 0 && <p className="text-center text-gray-500 border rounded-2xl py-12">Aucune demande pour le moment.</p>}
          {requests.map((r) => {
            const wa = socialHref("whatsapp", r.customer_phone);
            return (
              <div key={r.id} className="border rounded-2xl bg-[#1c1514] p-4 flex flex-wrap justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {r.combo_name} <span className="text-[#f5b942]">{formatXof(r.combo_price)}</span>
                  </p>
                  <p className="text-sm">
                    Le <strong>{new Date(r.event_date + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong> · {r.guests} personne{r.guests > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-gray-400">
                    {r.customer_name} · {r.customer_phone}
                  </p>
                  {r.message && <p className="text-sm text-gray-300 italic">&laquo; {r.message} &raquo;</p>}
                  <p className="text-xs text-gray-600">Recue le {new Date(r.created_at).toLocaleString("fr-FR")}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2 py-1 rounded-md ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  <div className="flex flex-wrap gap-2 justify-end text-sm">
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="border rounded-lg px-3 py-1">
                        WhatsApp
                      </a>
                    )}
                    {r.status !== "confirmed" && (
                      <button onClick={() => setComboRequestStatus(r.id, "confirmed").then(load)} className="border border-emerald-500/40 text-emerald-400 rounded-lg px-3 py-1">
                        Confirmer
                      </button>
                    )}
                    {r.status !== "cancelled" && (
                      <button onClick={() => setComboRequestStatus(r.id, "cancelled").then(load)} className="border border-red-500/40 text-red-400 rounded-lg px-3 py-1">
                        Annuler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setDraft(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="bg-[#1c1514] border rounded-2xl w-full max-w-2xl p-6 space-y-4 my-8">
            <h2 className="text-lg font-semibold">{draft.id ? "Modifier le combo" : "Nouveau combo"}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">Nom du combo *</span>
                <input required value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex. Combo Anniversaire 10 personnes" className="w-full border rounded-lg px-3 py-2" />
              </label>
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">Occasion</span>
                <input value={draft.occasion} onChange={(e) => set("occasion", e.target.value)} list="occasions" placeholder="Anniversaire, soiree entre amis..." className="w-full border rounded-lg px-3 py-2" />
                <datalist id="occasions">
                  {OCCASIONS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </label>
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">Prix (FCFA) *</span>
                <input required type="number" min={0} value={draft.price} onChange={(e) => set("price", e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              </label>
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">Pour combien de personnes</span>
                <input value={draft.serves} onChange={(e) => set("serves", e.target.value)} placeholder="Ex. 8 a 10 personnes" className="w-full border rounded-lg px-3 py-2" />
              </label>
            </div>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Description</span>
              <textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={2} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Contenu (un element par ligne)</span>
              <textarea value={draft.includes} onChange={(e) => set("includes", e.target.value)} rows={4} placeholder={"10 burgers\n10 frites\n2 litres de jus\n1 gateau"} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <div className="grid sm:grid-cols-3 gap-4">
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">Disponible a partir du</span>
                <input type="date" value={draft.starts_on} onChange={(e) => set("starts_on", e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              </label>
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">Jusqu&apos;au</span>
                <input type="date" value={draft.ends_on} onChange={(e) => set("ends_on", e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              </label>
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">Delai de reservation (h)</span>
                <input type="number" min={0} value={draft.min_notice_hours} onChange={(e) => set("min_notice_hours", e.target.value)} className="w-full border rounded-lg px-3 py-2" />
              </label>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.weekend_only} onChange={(e) => set("weekend_only", e.target.checked)} /> Uniquement le week-end (samedi / dimanche)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Affiche sur le site
              </label>
            </div>
            <div className="text-sm">
              <span className="block text-gray-400 mb-1">Photo (facultatif)</span>
              {draft.image && !draft.removeImage && (
                <div className="flex items-center gap-3 mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.image} alt="" className="h-16 w-24 object-cover rounded-lg" />
                  <button type="button" onClick={() => set("removeImage", true)} className="text-red-400 text-xs">Retirer la photo</button>
                </div>
              )}
              <input type="file" accept="image/*" onChange={(e) => set("file", e.target.files?.[0] ?? null)} />
            </div>
            {msg && <p className="text-sm text-red-400">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="border rounded-lg px-4 py-2">Annuler</button>
              <button disabled={busy} className="bg-[#b3261e] text-white rounded-lg px-5 py-2 font-medium disabled:opacity-50">
                {busy ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
