"use client";

import { useEffect, useState } from "react";
import { Cashier, PointOfSale, api, createCashier, fetchCashiers, fetchPointsOfSale, updateCashier } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

type Draft = { id: number | null; username: string; password: string; point_of_sale: string; is_active: boolean };
const emptyDraft: Draft = { id: null, username: "", password: "", point_of_sale: "", is_active: true };

export default function AdminCashiersPage() {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [del, setDel] = useState<Cashier | null>(null);

  const reload = () => fetchCashiers().then(setCashiers);
  useEffect(() => {
    reload();
    fetchPointsOfSale().then((l) => setStores(l.filter((s) => s.is_active)));
  }, []);

  const edit = (c: Cashier) => {
    setShowPwd(false);
    setDraft({ id: c.id, username: c.username, password: "", point_of_sale: String(c.point_of_sale), is_active: c.is_active });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    try {
      if (draft.id) {
        const original = cashiers.find((c) => c.id === draft.id);
        const body: Record<string, unknown> = { point_of_sale: Number(draft.point_of_sale), is_active: draft.is_active };
        if (draft.username !== original?.username) body.username = draft.username;
        if (draft.password) body.password = draft.password;
        await updateCashier(draft.id, body);
        setMsg({ ok: true, text: `Compte « ${draft.username} » modifie${draft.password ? " (nouveau mot de passe enregistre)" : ""}.` });
      } else {
        await createCashier({ username: draft.username, password: draft.password, point_of_sale: Number(draft.point_of_sale) });
        setMsg({ ok: true, text: `Caissier « ${draft.username} » cree.` });
      }
      setDraft(null);
      reload();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Enregistrement impossible.") });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!del) return;
    setBusy(true);
    try {
      await api.delete(`/accounts/cashiers/${del.id}/`);
      setMsg({ ok: true, text: `Compte « ${del.username} » supprime.` });
      setDel(null);
      reload();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Suppression impossible.") });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Cashier) {
    await updateCashier(c.id, { is_active: !c.is_active });
    reload();
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Caissiers</h1>
          <p className="text-sm text-gray-500">
            Les caissiers se connectent sur <span className="font-mono">caisse.labelleteranga.com</span>. Ils ne voient ni les rapports, ni les clotures : uniquement l&apos;ecran de vente de leur
            point de vente.
          </p>
        </div>
        <button
          onClick={() => {
            setShowPwd(false);
            setDraft({ ...emptyDraft, point_of_sale: stores[0] ? String(stores[0].id) : "" });
          }}
          className="bg-[#b3261e] text-white rounded-lg px-4 py-2 font-medium"
        >
          + Nouveau caissier
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}

      <div className="border rounded-2xl bg-[#1c1514] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-400">
            <tr>
              <th className="p-3">Identifiant</th>
              <th className="p-3">Point de vente</th>
              <th className="p-3">Statut</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {cashiers.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-500">
                  Aucun caissier.
                </td>
              </tr>
            )}
            {cashiers.map((c) => (
              <tr key={c.id} className="border-t border-white/5">
                <td className="p-3 font-medium">{c.username}</td>
                <td className="p-3 text-gray-400">{c.point_of_sale_name}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-1 rounded-md ${c.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                    {c.is_active ? "Actif" : "Desactive"}
                  </span>
                </td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => edit(c)} className="border rounded-lg px-3 py-1 text-xs">
                    Modifier
                  </button>
                  <button onClick={() => toggle(c)} className="border rounded-lg px-3 py-1 text-xs">
                    {c.is_active ? "Desactiver" : "Reactiver"}
                  </button>
                  <button onClick={() => setDel(c)} className="border border-red-500/40 text-red-400 rounded-lg px-3 py-1 text-xs">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setDraft(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="bg-[#1c1514] border rounded-2xl w-full max-w-md p-6 space-y-4 my-8">
            <h2 className="text-lg font-semibold">{draft.id ? "Modifier le caissier" : "Nouveau caissier"}</h2>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Identifiant de connexion *</span>
              <input
                required
                value={draft.username}
                onChange={(e) => set("username", e.target.value.trim())}
                placeholder="ex. caissier1"
                autoComplete="off"
                className="w-full border rounded-lg px-3 py-2"
              />
            </label>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">{draft.id ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe * (8 caracteres minimum)"}</span>
              <div className="flex gap-2">
                <input
                  required={!draft.id}
                  type={showPwd ? "text" : "password"}
                  minLength={8}
                  value={draft.password}
                  onChange={(e) => set("password", e.target.value)}
                  autoComplete="new-password"
                  className="flex-1 border rounded-lg px-3 py-2"
                />
                <button type="button" onClick={() => setShowPwd((v) => !v)} className="border rounded-lg px-3 text-xs">
                  {showPwd ? "Masquer" : "Afficher"}
                </button>
              </div>
            </label>
            <label className="text-sm block">
              <span className="block text-gray-400 mb-1">Point de vente *</span>
              <select required value={draft.point_of_sale} onChange={(e) => set("point_of_sale", e.target.value)} className="w-full border rounded-lg px-3 py-2">
                <option value="">Choisir...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {draft.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Compte actif (peut se connecter)
              </label>
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
          <div onClick={(e) => e.stopPropagation()} className="bg-[#1c1514] border border-red-500/50 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-400">Supprimer le caissier « {del.username} » ?</h2>
            <p className="text-sm text-gray-300">
              Le compte ne pourra plus se connecter et disparait de la liste. Ses ventes et fermetures de caisse passees restent dans les rapports. Pour seulement
              suspendre l&apos;acces, utilisez plutot « Desactiver ».
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDel(null)} className="border rounded-lg px-4 py-2">
                Annuler
              </button>
              <button onClick={confirmDelete} disabled={busy} className="bg-red-600 text-white rounded-lg px-5 py-2 font-medium disabled:opacity-50">
                {busy ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
