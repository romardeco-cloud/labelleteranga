"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Category,
  PointOfSale,
  Product,
  api,
  createCategory,
  fetchCategories,
  fetchPointsOfSale,
  setStock,
  updateProduct,
} from "@/lib/api";
import { getAdminToken } from "@/lib/auth";

function formatXof(value: string | number) {
  return new Intl.NumberFormat("fr-SN", { maximumFractionDigits: 0 }).format(Number(value)) + " FCFA";
}

const emptyForm = {
  sku: "",
  name: "",
  price: "",
  compare_at_price: "",
  category_id: "",
  unit: "unite",
  description: "",
};

type EditableProduct = typeof emptyForm & { is_active: boolean };

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditableProduct | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    api.get("/catalog/products/", { params: { page_size: 100 } }).then((res) =>
      setProducts(res.data.results ?? res.data)
    );
  }

  useEffect(() => {
    reload();
    fetchPointsOfSale().then(setStores);
    fetchCategories().then(setCategories);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => v && data.append(k, v));
    if (newImage) data.append("image", newImage);
    await api.post("/catalog/products/", data, { headers: { "Content-Type": "multipart/form-data" } });
    setForm(emptyForm);
    setNewImage(null);
    reload();
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return;
    const cat = await createCategory(newCategory.trim());
    setCategories([...categories, cat]);
    setNewCategory("");
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setExpanded(null);
    setEditForm({
      sku: p.sku,
      name: p.name,
      price: p.price,
      compare_at_price: p.compare_at_price ?? "",
      category_id: p.category?.id ? String(p.category.id) : "",
      unit: p.unit,
      description: p.description,
      is_active: p.is_active,
    });
    setEditImage(null);
  }

  async function saveEdit(id: number) {
    if (!editForm) return;
    const data = new FormData();
    Object.entries(editForm).forEach(([k, v]) => {
      if (k === "is_active") {
        data.append(k, String(v));
      } else if (v) {
        data.append(k, String(v));
      }
    });
    if (editImage) data.append("image", editImage);
    await updateProduct(id, data);
    setEditingId(null);
    setEditForm(null);
    reload();
  }

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce produit ?")) return;
    await api.delete(`/catalog/products/${id}/`);
    reload();
  }

  async function handleStockChange(productId: number, storeId: number, quantity: number) {
    await setStock(productId, storeId, quantity);
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

      {stores.length === 0 && (
        <p className="text-sm bg-yellow-50 text-yellow-800 border border-yellow-200 p-2 rounded">
          Aucun point de vente actif. Creez-en un dans{" "}
          <a href="/admin/stores" className="underline">
            Points de vente
          </a>{" "}
          avant de pouvoir renseigner du stock.
        </p>
      )}

      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <input
            placeholder="Nouvelle categorie"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm"
          />
          <button type="button" onClick={handleAddCategory} className="text-xs border rounded px-2 py-1.5">
            Ajouter categorie
          </button>
        </div>

        <form onSubmit={handleCreate} className="grid sm:grid-cols-6 gap-2">
          <input
            required
            placeholder="Reference (SKU)"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            required
            placeholder="Nom du produit"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm sm:col-span-2"
          />
          <select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Sans categorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            placeholder="Prix (FCFA)"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Unite"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            placeholder="Prix barre (optionnel)"
            value={form.compare_at_price}
            onChange={(e) => setForm({ ...form, compare_at_price: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm sm:col-span-3"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setNewImage(e.target.files?.[0] ?? null)}
            className="text-xs sm:col-span-2"
          />
          <button className="bg-brand text-white rounded px-3 py-1.5 text-sm sm:col-span-6">
            Ajouter le produit
          </button>
        </form>
      </div>
      <p className="text-xs text-gray-400 -mt-6">
        Le stock se gere ensuite par point de vente, via le bouton &quot;Stock&quot; de chaque produit.
      </p>

      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">SKU</th>
            <th className="p-2">Nom</th>
            <th className="p-2">Categorie</th>
            <th className="p-2">Prix</th>
            <th className="p-2">Stock total</th>
            <th className="p-2">Statut</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <React.Fragment key={p.id}>
              {editingId === p.id && editForm ? (
                <tr className="border-t bg-brand-light/40">
                  <td className="p-2" colSpan={7}>
                    <div className="grid sm:grid-cols-6 gap-2 mb-2">
                      <input
                        value={editForm.sku}
                        onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                        className="border rounded px-2 py-1.5 text-sm"
                        placeholder="SKU"
                      />
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="border rounded px-2 py-1.5 text-sm sm:col-span-2"
                        placeholder="Nom"
                      />
                      <select
                        value={editForm.category_id}
                        onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                        className="border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="">Sans categorie</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={editForm.price}
                        onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                        className="border rounded px-2 py-1.5 text-sm"
                        placeholder="Prix"
                      />
                      <input
                        placeholder="Unite"
                        value={editForm.unit}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        className="border rounded px-2 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="Prix barre"
                        value={editForm.compare_at_price}
                        onChange={(e) => setEditForm({ ...editForm, compare_at_price: e.target.value })}
                        className="border rounded px-2 py-1.5 text-sm"
                      />
                      <input
                        placeholder="Description"
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="border rounded px-2 py-1.5 text-sm sm:col-span-3"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={editForm.is_active}
                          onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                        />
                        Actif
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEditImage(e.target.files?.[0] ?? null)}
                        className="text-xs sm:col-span-2"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(p.id)}
                        className="bg-brand text-white text-xs px-3 py-1.5 rounded"
                      >
                        Enregistrer
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                        }}
                        className="text-xs px-3 py-1.5 border rounded"
                      >
                        Annuler
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr className="border-t">
                  <td className="p-2">{p.sku}</td>
                  <td className="p-2">{p.name}</td>
                  <td className="p-2">{p.category?.name ?? "-"}</td>
                  <td className="p-2">
                    {p.active_promotion_name ? (
                      <>
                        <span className="line-through text-gray-400 mr-1">{formatXof(p.price)}</span>
                        <span className="text-red-600 font-medium">{formatXof(p.effective_price)}</span>
                      </>
                    ) : (
                      formatXof(p.price)
                    )}
                  </td>
                  <td className="p-2">{p.total_stock}</td>
                  <td className="p-2">{p.is_active ? "Actif" : "Inactif"}</td>
                  <td className="p-2 text-right space-x-2">
                    <button
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="text-brand text-xs underline"
                    >
                      Stock
                    </button>
                    <button onClick={() => startEdit(p)} className="text-brand text-xs underline">
                      Modifier
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-500 text-xs">
                      Supprimer
                    </button>
                  </td>
                </tr>
              )}
              {expanded === p.id && (
                <tr className="bg-brand-light/40 border-t">
                  <td colSpan={7} className="p-3">
                    <p className="text-xs font-medium text-brand-dark mb-2">Stock par point de vente</p>
                    <div className="flex flex-wrap gap-3">
                      {stores.map((s) => {
                        const current = p.stocks.find((st) => st.point_of_sale === s.id)?.quantity ?? 0;
                        return (
                          <label key={s.id} className="flex items-center gap-2 text-xs">
                            <span>{s.name}</span>
                            <input
                              type="number"
                              min={0}
                              defaultValue={current}
                              onBlur={(e) => handleStockChange(p.id, s.id, Number(e.target.value))}
                              className="w-20 border rounded px-2 py-1"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
