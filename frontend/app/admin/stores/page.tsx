"use client";

import { useEffect, useState } from "react";
import { PointOfSale, createPointOfSale, fetchPointsOfSale, updatePointOfSale } from "@/lib/api";

const emptyForm = { name: "", address: "", phone: "" };

export default function AdminStoresPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function reload() {
    fetchPointsOfSale().then(setStores);
  }

  useEffect(reload, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPointOfSale(form);
      setForm(emptyForm);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(store: PointOfSale) {
    await updatePointOfSale(store.id, { is_active: !store.is_active });
    reload();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Points de vente</h1>

      <form onSubmit={handleCreate} className="grid sm:grid-cols-4 gap-2 bg-white border rounded-lg p-4">
        <input
          required
          placeholder="Nom du magasin"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Adresse"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm sm:col-span-2"
        />
        <input
          placeholder="Telephone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <button
          disabled={saving}
          className="bg-brand text-white rounded px-3 py-1.5 text-sm sm:col-span-4 disabled:opacity-50"
        >
          Ajouter le point de vente
        </button>
      </form>

      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Nom</th>
            <th className="p-2">Adresse</th>
            <th className="p-2">Telephone</th>
            <th className="p-2">Statut</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-2 font-medium">{s.name}</td>
              <td className="p-2">{s.address || "-"}</td>
              <td className="p-2">{s.phone || "-"}</td>
              <td className="p-2">{s.is_active ? "Actif" : "Inactif"}</td>
              <td className="p-2 text-right">
                <button onClick={() => toggleActive(s)} className="text-brand text-xs underline">
                  {s.is_active ? "Desactiver" : "Reactiver"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
