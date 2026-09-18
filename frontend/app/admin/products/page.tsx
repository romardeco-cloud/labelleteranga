"use client";

import { useEffect, useRef, useState } from "react";
import { Product, api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

const emptyForm = {
  sku: "",
  name: "",
  price: "",
  stock_quantity: "0",
  unit: "unite",
  description: "",
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [importSummary, setImportSummary] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    api.get("/catalog/products/", { params: { page_size: 100 } }).then((res) =>
      setProducts(res.data.results ?? res.data)
    );
  }

  useEffect(reload, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/catalog/products/", form);
    setForm(emptyForm);
    reload();
  }

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce produit ?")) return;
    await api.delete(`/catalog/products/${id}/`);
    reload();
  }

  async function handleExport() {
    const token = getAdminToken();
    const res = await fetch(`${api.defaults.baseURL}/catalog/products/export_excel/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "produits_labelleteranga.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await api.post("/catalog/products/import_excel/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setImportSummary(
      `${res.data.created} produits crees, ${res.data.updated} mis a jour, ${res.data.errors.length} erreurs.`
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
    reload();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produits</h1>
        <div className="flex gap-2">
          <button onClick={handleExport} className="border px-3 py-1.5 rounded text-sm">
            Exporter Excel
          </button>
          <label className="bg-brand text-white px-3 py-1.5 rounded text-sm cursor-pointer">
            Importer Excel
            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      {importSummary && <p className="text-sm text-brand-dark bg-brand-light p-2 rounded">{importSummary}</p>}

      <form onSubmit={handleCreate} className="grid sm:grid-cols-6 gap-2 bg-white border rounded-lg p-4">
        <input
          required
          placeholder="Reference (SKU)"
          value={form.sku}
          onChange={(e) => setForm({ ...form, sku: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm sm:col-span-1"
        />
        <input
          required
          placeholder="Nom du produit"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm sm:col-span-2"
        />
        <input
          required
          type="number"
          placeholder="Prix (FCFA)"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          placeholder="Stock"
          value={form.stock_quantity}
          onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Unite"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
          className="border rounded px-2 py-1.5 text-sm"
        />
        <button className="bg-brand text-white rounded px-3 py-1.5 text-sm sm:col-span-6">Ajouter le produit</button>
      </form>

      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">SKU</th>
            <th className="p-2">Nom</th>
            <th className="p-2">Prix</th>
            <th className="p-2">Stock</th>
            <th className="p-2">Statut</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-2">{p.sku}</td>
              <td className="p-2">{p.name}</td>
              <td className="p-2">{formatXof(p.price)}</td>
              <td className="p-2">{p.stock_quantity}</td>
              <td className="p-2">{p.is_active ? "Actif" : "Inactif"}</td>
              <td className="p-2 text-right">
                <button onClick={() => handleDelete(p.id)} className="text-red-500">
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
