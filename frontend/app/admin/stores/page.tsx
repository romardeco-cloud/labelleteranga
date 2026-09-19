"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PointOfSale, api, createPointOfSale, fetchPointsOfSale, updatePointOfSale } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";
import { siteUrl } from "@/lib/site";

type Impact = { products: number; cashiers: number; orders: number; reviews: number; loyalty_members: number };
type Draft = { id: number | null; name: string; address: string; phone: string; description: string; slug: string; online_enabled: boolean; is_active: boolean };

const emptyDraft: Draft = { id: null, name: "", address: "", phone: "", description: "", slug: "", online_enabled: true, is_active: true };

export default function AdminStoresPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [del, setDel] = useState<{ store: PointOfSale; impact: Impact | null; typed: string } | null>(null);

  const reload = () => fetchPointsOfSale().then(setStores);
  useEffect(() => {
    reload();
  }, []);

  const edit = (s: PointOfSale) =>
    setDraft({
      id: s.id,
      name: s.name,
      address: s.address ?? "",
      phone: s.phone ?? "",
      description: s.description ?? "",
      slug: s.slug ?? "",
      online_enabled: !!s.online_enabled,
      is_active: s.is_active,
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const { id, ...body } = draft;
      if (id) await updatePointOfSale(id, { ...body, slug: body.slug || null });
      else await createPointOfSale({ ...body, ...(body.slug ? {} : { slug: undefined }) } as never);
      setDraft(null);
      setMsg({ ok: true, text: id ? "Point de vente modifie." : "Point de vente ajoute avec la configuration des autres (infos legales, paiements, ticket, site web)." });
      reload();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Enregistrement impossible.") });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(s: PointOfSale) {
    await updatePointOfSale(s.id, { is_active: !s.is_active });
    reload();
  }

  async function askDelete(s: PointOfSale) {
    setMsg(null);
    try {
      await api.delete(`/stores/points-of-sale/${s.id}/`);
      reload(); // supprime directement si le serveur ne demande pas de confirmation
    } catch (err: any) {
      if (err?.response?.status === 409) setDel({ store: s, impact: err.response.data.impact ?? null, typed: "" });
      else setMsg({ ok: false, text: apiErrorMessage(err, "Suppression impossible.") });
    }
  }

  async function confirmDelete() {
    if (!del) return;
    setBusy(true);
    try {
      await api.delete(`/stores/points-of-sale/${del.store.id}/`, { params: { confirm_name: del.typed } });
      setMsg({ ok: true, text: `« ${del.store.name} » a ete supprime.` });
      setDel(null);
      reload();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Suppression impossible.") });
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Points de vente</h1>
          <p className="text-sm text-gray-500">
            Modifiez le nom, l&apos;adresse, le telephone et le statut, ou supprimez un point de vente. Le reste (paiements, RCCM / NINEA, ticket, reseaux sociaux,
            fidelite) se regle dans <Link href="/admin/settings" className="text-[#f5b942] underline">Parametres</Link>.
          </p>
        </div>
        <button onClick={() => setDraft({ ...emptyDraft })} className="bg-[#b3261e] text-white rounded-lg px-4 py-2 font-medium">
          + Ajouter un point de vente
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stores.map((s) => (
          <article key={s.id} className={`border rounded-2xl bg-[#1c1514] p-4 space-y-2 ${s.is_active ? "" : "opacity-70"}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-tight">{s.name}</h2>
              <span className={`text-xs px-2 py-1 rounded-md shrink-0 ${s.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                {s.is_active ? "Actif" : "Inactif"}
              </span>
            </div>
            <p className="text-sm text-gray-400">{s.address || "Adresse non renseignee"}</p>
            <p className="text-sm text-gray-400">{s.phone || "Telephone non renseigne"}</p>
            {s.slug && s.online_enabled && (
              <a href={siteUrl(s)} target="_blank" rel="noreferrer" className="text-xs text-[#f5b942] break-all">
                {siteUrl(s).replace("https://", "")}
              </a>
            )}
            <div className="flex flex-wrap gap-2 pt-2 text-sm">
              <button onClick={() => edit(s)} className="border rounded-lg px-3 py-1">
                Modifier
              </button>
              <button onClick={() => toggleActive(s)} className="border rounded-lg px-3 py-1">
                {s.is_active ? "Desactiver" : "Reactiver"}
              </button>
              <button onClick={() => askDelete(s)} className="border border-red-500/40 text-red-400 rounded-lg px-3 py-1">
                Supprimer
              </button>
            </div>
          </article>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setDraft(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="bg-[#1c1514] border rounded-2xl w-full max-w-lg p-6 space-y-4 my-8">
            <h2 className="text-lg font-semibold">{draft.id ? "Modifier le point de vente" : "Nouveau point de vente"}</h2>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Nom *</span>
              <input required value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex. Ferme La Belle Teranga" className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Adresse</span>
              <input value={draft.address} onChange={(e) => set("address", e.target.value)} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Telephone</span>
              <input value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+221 77 000 00 00" className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Description courte (affichee sur le site)</span>
              <input value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={200} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Identifiant du site (adresse web)</span>
              <input
                value={draft.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="laisser vide : cree a partir du nom"
                className="w-full border rounded-lg px-3 py-2"
              />
            </label>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.online_enabled} onChange={(e) => set("online_enabled", e.target.checked)} /> Site web en ligne
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Point de vente actif
              </label>
            </div>
            {!draft.id && (
              <p className="text-xs text-gray-500">
                Le nouveau point de vente recoit automatiquement la configuration des autres : RCCM / NINEA, moyens de paiement, ticket de caisse, modules, reseaux sociaux
                et fidelite. Vous pourrez ensuite ajuster chaque reglage.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="border rounded-lg px-4 py-2">
                Annuler
              </button>
              <button disabled={busy} className="bg-[#b3261e] text-white rounded-lg px-5 py-2 font-medium disabled:opacity-50">
                {busy ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {del && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4" onClick={() => setDel(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#1c1514] border border-red-500/50 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-400">Supprimer « {del.store.name} » definitivement ?</h2>
            <div className="text-sm text-gray-300 space-y-1">
              <p>Seront supprimes : ses stocks, categories, parametres, menus du jour, avis, clients fideles et combos.</p>
              {del.impact && (
                <ul className="list-disc list-inside text-gray-400">
                  <li>{del.impact.products} produit(s) rattache(s) au point de vente</li>
                  <li>{del.impact.cashiers} compte(s) caissier (supprime(s))</li>
                  <li>{del.impact.reviews} avis client(s) et {del.impact.loyalty_members} client(s) fidele(s)</li>
                  <li>
                    {del.impact.orders} vente(s) passee(s) : conservee(s) dans les rapports, mais sans point de vente rattache
                  </li>
                </ul>
              )}
              <p className="text-amber-400">Cette action est irreversible. Preferez « Desactiver » si vous voulez seulement le cacher.</p>
            </div>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">
                Pour confirmer, saisissez exactement : <strong className="text-white">{del.store.name}</strong>
              </span>
              <input value={del.typed} onChange={(e) => setDel({ ...del, typed: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDel(null)} className="border rounded-lg px-4 py-2">
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={busy || del.typed.trim() !== del.store.name}
                className="bg-red-600 text-white rounded-lg px-5 py-2 font-medium disabled:opacity-40"
              >
                {busy ? "Suppression..." : "Supprimer definitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
