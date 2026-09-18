"use client";

import { useEffect, useState } from "react";
import {
  Cashier,
  PointOfSale,
  createCashier,
  fetchCashiers,
  fetchPointsOfSale,
  updateCashier,
} from "@/lib/api";

export default function AdminCashiersPage() {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [form, setForm] = useState({ username: "", password: "", point_of_sale: "" });
  const [error, setError] = useState("");

  function reload() {
    fetchCashiers().then(setCashiers);
  }

  useEffect(() => {
    reload();
    fetchPointsOfSale().then(setStores);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createCashier({
        username: form.username,
        password: form.password,
        point_of_sale: Number(form.point_of_sale),
      });
      setForm({ username: "", password: "", point_of_sale: "" });
      reload();
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d ? Object.values(d).flat().join(" ") : "Creation impossible.");
    }
  }

  async function toggle(c: Cashier) {
    await updateCashier(c.id, { is_active: !c.is_active });
    reload();
  }

  async function resetPassword(c: Cashier) {
    const pwd = prompt(`Nouveau mot de passe pour ${c.username} (8 caracteres minimum) :`);
    if (!pwd) return;
    try {
      await updateCashier(c.id, { password: pwd });
      alert("Mot de passe modifie.");
    } catch {
      alert("Mot de passe refuse (8 caracteres minimum).");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Caissiers</h1>
        <p className="text-sm text-gray-500">
          Les caissiers se connectent sur <span className="font-mono">/caisse</span>. Ils ne voient ni les rapports,
          ni les prix, ni les clotures : uniquement l&apos;ecran de vente de leur point de vente.
        </p>
      </div>

      <form onSubmit={handleCreate} className="grid sm:grid-cols-4 gap-2 bg-white border rounded-lg p-4">
        <input
          required
          placeholder="Identifiant (ex: caissier1)"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <input
          required
          type="password"
          minLength={8}
          placeholder="Mot de passe (8+ car.)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <select
          required
          value={form.point_of_sale}
          onChange={(e) => setForm({ ...form, point_of_sale: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        >
          <option value="">Point de vente...</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="bg-brand text-white rounded px-3 py-1.5 text-sm">Creer le caissier</button>
        {error && <p className="text-red-600 text-sm sm:col-span-4">{error}</p>}
      </form>

      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Identifiant</th>
            <th className="p-2">Point de vente</th>
            <th className="p-2">Statut</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {cashiers.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="p-2 font-medium">{c.username}</td>
              <td className="p-2">{c.point_of_sale_name}</td>
              <td className="p-2">{c.is_active ? "Actif" : "Desactive"}</td>
              <td className="p-2 text-right space-x-3">
                <button onClick={() => resetPassword(c)} className="text-brand text-xs underline">
                  Changer le mot de passe
                </button>
                <button onClick={() => toggle(c)} className="text-brand text-xs underline">
                  {c.is_active ? "Desactiver" : "Reactiver"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
