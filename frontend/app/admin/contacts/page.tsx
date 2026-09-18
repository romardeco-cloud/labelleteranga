"use client";

import { useEffect, useState } from "react";
import { Party, apiErrorMessage, deleteParty, listParties, saveParty } from "@/lib/documents";

type Kind = "customers" | "suppliers";
const empty = { name: "", phone: "", email: "", address: "", tax_id: "" };

function PartySection({ kind, title }: { kind: Kind; title: string }) {
  const [items, setItems] = useState<Party[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  function reload() {
    listParties(kind).then(setItems);
  }
  useEffect(reload, [kind]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await saveParty(kind, form, editing ?? undefined);
      setForm(empty);
      setEditing(null);
      reload();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function remove(p: Party) {
    if (!confirm(`Supprimer ${p.name} ?`)) return;
    try {
      await deleteParty(kind, p.id);
      reload();
    } catch {
      alert("Suppression impossible : des documents sont lies a ce contact.");
    }
  }

  const input = "border rounded px-2 py-1.5 text-sm";
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <form onSubmit={submit} className="grid sm:grid-cols-6 gap-2 bg-white border rounded-lg p-3">
        <input required placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} sm:col-span-2`} />
        <input placeholder="Telephone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} />
        <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        <input placeholder="NINEA / RC" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className={input} />
        <button className="bg-brand text-white rounded px-3 py-1.5 text-sm">{editing ? "Enregistrer" : "Ajouter"}</button>
        <input placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={`${input} sm:col-span-6`} />
        {error && <p className="text-red-600 text-sm sm:col-span-6">{error}</p>}
      </form>
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Nom</th>
            <th className="p-2">Telephone</th>
            <th className="p-2">Email</th>
            <th className="p-2">NINEA / RC</th>
            <th className="p-2">Adresse</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-2 font-medium">{p.name}</td>
              <td className="p-2">{p.phone || "-"}</td>
              <td className="p-2">{p.email || "-"}</td>
              <td className="p-2">{p.tax_id || "-"}</td>
              <td className="p-2">{p.address || "-"}</td>
              <td className="p-2 text-right space-x-3">
                <button
                  className="text-brand text-xs underline"
                  onClick={() => {
                    setEditing(p.id);
                    setForm({ name: p.name, phone: p.phone, email: p.email, address: p.address, tax_id: p.tax_id });
                  }}
                >
                  Modifier
                </button>
                <button className="text-red-500 text-xs underline" onClick={() => remove(p)}>
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-gray-400">
                Aucun contact.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

export default function ContactsPage() {
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Clients et fournisseurs</h1>
      <PartySection kind="customers" title="Clients" />
      <PartySection kind="suppliers" title="Fournisseurs" />
    </div>
  );
}
