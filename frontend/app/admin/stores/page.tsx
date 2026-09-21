"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PointOfSale, api, createPointOfSale, fetchPointsOfSale, updatePointOfSale } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";
import { siteUrl } from "@/lib/site";

type Impact = { products: number; cashiers: number; orders: number; reviews: number; loyalty_members: number };
type Draft = { id: number | null; name: string; address: string; phone: string; description: string; slug: string; online_enabled: boolean; is_active: boolean };

const emptyDraft: Draft = { id: null, name: "", address: "", phone: "", description: "", slug: "", online_enabled: true, is_active: true };

/** Nom saisi = nom du point de vente, sans tenir compte des majuscules ni des espaces en trop. */
const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

export default function AdminStoresPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [del, setDel] = useState<{ store: PointOfSale; impact: Impact | null; typed: string } | null>(null);
  type Reset = { store: PointOfSale; counts: Record<string, { label: string; count: number }>; backedUp: boolean; typed: string; pin: string; stock: boolean };
  const [reset, setReset] = useState<Reset | null>(null);

  async function openReset(s: PointOfSale) {
    setMsg(null);
    try {
      const res = await api.get(`/stores/points-of-sale/${s.id}/reset-preview/`);
      setReset({ store: s, counts: res.data.counts, backedUp: false, typed: "", pin: "", stock: false });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Impossible de charger l'apercu.") });
    }
  }
  async function downloadBackup() {
    if (!reset) return;
    try {
      const res = await api.get(`/stores/points-of-sale/${reset.store.id}/reset-backup/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sauvegarde_${reset.store.slug ?? reset.store.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setReset({ ...reset, backedUp: true });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Sauvegarde impossible.") });
    }
  }
  async function confirmReset() {
    if (!reset) return;
    setBusy(true);
    try {
      const res = await api.post(`/stores/points-of-sale/${reset.store.id}/reset-data/`, { pin: reset.pin, confirm_name: reset.typed, include_stock_levels: reset.stock });
      const n = Object.values(res.data.deleted as Record<string, number>).reduce((a, b) => a + b, 0);
      setMsg({ ok: true, text: `« ${reset.store.name} » remis a zero : ${n} enregistrement(s) supprime(s). Le point de vente demarre proprement.` });
      setReset(null);
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Remise a zero impossible.") });
      setReset((r) => (r ? { ...r, pin: "" } : r));
    } finally {
      setBusy(false);
    }
  }

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
              <button onClick={() => openReset(s)} className="border border-amber-500/40 text-amber-400 rounded-lg px-3 py-1" title="Efface les transactions de test avant le demarrage officiel">
                Remettre a zero
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

      {reset && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setReset(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#1c1514] border border-amber-500/50 rounded-2xl w-full max-w-lg p-6 space-y-4 my-8">
            <h2 className="text-lg font-semibold text-amber-400">Remettre « {reset.store.name} » a zero</h2>
            <p className="text-sm text-gray-300">
              Efface toutes les transactions de test pour un demarrage officiel propre : ventes, clotures de caisse, devis / factures / bons de commande, mouvements de
              stock, avis, points de fidelite. Les produits, prix, categories, parametres, caissiers et menus sont <strong>conserves</strong>.
            </p>
            <ul className="text-sm text-gray-400 list-disc list-inside">
              {Object.values(reset.counts)
                .filter((c) => c.count > 0)
                .map((c) => (
                  <li key={c.label}>
                    {c.count} {c.label.toLowerCase()}
                  </li>
                ))}
              {Object.values(reset.counts).every((c) => c.count === 0) && <li>Rien a supprimer : ce point de vente est deja a zero.</li>}
            </ul>
            <div className="border rounded-xl p-3 space-y-2">
              <p className="text-sm font-medium">1. Telechargez d&apos;abord la sauvegarde</p>
              <button onClick={downloadBackup} className={`w-full rounded-lg py-2 text-sm font-medium ${reset.backedUp ? "bg-emerald-600 text-white" : "border border-[#f5b942] text-[#f5b942]"}`}>
                {reset.backedUp ? "Sauvegarde telechargee (Excel) - a conserver" : "Telecharger la sauvegarde (Excel)"}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reset.stock} onChange={(e) => setReset({ ...reset, stock: e.target.checked })} /> Remettre aussi les quantites en stock a 0
            </label>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm block sm:col-span-2">
                <span className="block text-gray-400 mb-1">
                  2. Saisissez exactement : <strong className="text-white">{reset.store.name}</strong>
                </span>
                <div className="flex gap-2">
                  <input
                    name="confirm-store-name"
                    autoComplete="off"
                    value={reset.typed}
                    onChange={(e) => setReset({ ...reset, typed: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                  <button type="button" onClick={() => setReset({ ...reset, typed: reset.store.name })} className="shrink-0 border rounded-lg px-3 text-sm text-[#f5b942]">
                    Remplir
                  </button>
                </div>
              </label>
              <label className="text-sm block">
                <span className="block text-gray-400 mb-1">3. Code secret (4 chiffres)</span>
                <input
                  type="password"
                  name="confirm-security-code"
                  autoComplete="new-password"
                  inputMode="numeric"
                  maxLength={4}
                  value={reset.pin}
                  onChange={(e) => setReset({ ...reset, pin: e.target.value.replace(/\D/g, "") })}
                  className="w-full border rounded-lg px-3 py-2 tracking-[0.5em] text-center"
                />
              </label>
            </div>
            <p className="text-xs text-red-400">Irreversible. Les autres points de vente ne sont pas touches.</p>
            {(() => {
              const missing = [
                !reset.backedUp && "telecharger la sauvegarde (etape 1)",
                sameName(reset.typed, reset.store.name) ? "" : "saisir le nom exact du point de vente (etape 2)",
                reset.pin.length === 4 ? "" : "saisir le code secret a 4 chiffres (etape 3)",
              ].filter(Boolean);
              return missing.length > 0 ? <p className="text-xs text-amber-400">Il reste a faire : {missing.join(" · ")}.</p> : <p className="text-xs text-emerald-400">Tout est pret : vous pouvez confirmer.</p>;
            })()}
            <div className="flex justify-end gap-2">
              <button onClick={() => setReset(null)} className="border rounded-lg px-4 py-2">
                Annuler
              </button>
              <button
                onClick={confirmReset}
                disabled={busy || !reset.backedUp || !sameName(reset.typed, reset.store.name) || reset.pin.length !== 4}
                className="bg-red-600 text-white rounded-lg px-5 py-2 font-medium disabled:opacity-40"
              >
                {busy ? "Remise a zero..." : "Remettre a zero definitivement"}
              </button>
            </div>
          </div>
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
