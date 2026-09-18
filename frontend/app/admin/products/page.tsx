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
import ProductVisual from "@/components/ProductVisual";
import { getAdminToken } from "@/lib/auth";
import { matchKey, prepareImage } from "@/lib/images";
import { downloadFile } from "@/lib/documents";

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
  const [storeId, setStoreId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [photoMsg, setPhotoMsg] = useState("");
  const bulkRef = useRef<HTMLInputElement>(null);
  const store = stores.find((x) => x.id === storeId) ?? null;
  const storeSlug = store ? store.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";

  function reload() {
    api
      .get("/catalog/products/", {
        params: { page_size: 500, ...(storeId ? { point_of_sale: storeId } : {}), ...(search ? { search } : {}) },
      })
      .then((res) => setProducts(res.data.results ?? res.data));
  }

  useEffect(() => {
    fetchPointsOfSale().then((list) => setStores(list.filter((x) => x.is_active)));
    fetchCategories().then(setCategories);
  }, []);

  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => v && data.append(k, v));
    if (newImage) data.append("image", await prepareImage(newImage));
    const created = await api.post("/catalog/products/", data, { headers: { "Content-Type": "multipart/form-data" } });
    if (storeId) await setStock(created.data.id, storeId, 0); // rattache le nouveau produit au point de vente choisi
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
    if (editImage) data.append("image", await prepareImage(editImage));
    await updateProduct(id, data);
    setEditingId(null);
    setEditForm(null);
    reload();
  }

  async function uploadPhoto(p: Product, file: File | undefined) {
    if (!file) return;
    setUploadingId(p.id);
    setPhotoMsg("");
    try {
      const data = new FormData();
      data.append("image", await prepareImage(file));
      await updateProduct(p.id, data);
      reload();
    } catch {
      setPhotoMsg(`Photo de "${p.name}" non enregistree (fichier trop lourd ou stockage d'images indisponible).`);
    } finally {
      setUploadingId(null);
    }
  }

  async function removePhoto(p: Product) {
    if (!confirm(`Retirer la photo de "${p.name}" ?`)) return;
    const data = new FormData();
    data.append("image", "");
    await updateProduct(p.id, data);
    reload();
  }

  // Plusieurs photos d'un coup : le nom de chaque fichier doit etre la reference (SKU) ou le nom du produit.
  async function bulkPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (bulkRef.current) bulkRef.current.value = "";
    if (files.length === 0) return;
    const bySku = new Map(products.map((p) => [matchKey(p.sku), p]));
    const byName = new Map(products.map((p) => [matchKey(p.name), p]));
    let done = 0;
    const unmatched: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setPhotoMsg(`Envoi des photos... ${i + 1} / ${files.length}`);
      const key = matchKey(f.name.replace(/\.[^.]+$/, ""));
      const target = bySku.get(key) ?? byName.get(key);
      if (!target) {
        unmatched.push(f.name);
        continue;
      }
      try {
        const data = new FormData();
        data.append("image", await prepareImage(f));
        await updateProduct(target.id, data);
        done++;
      } catch {
        unmatched.push(`${f.name} (echec de l'envoi)`);
      }
    }
    setPhotoMsg(
      `${done} photo(s) ajoutee(s).` +
        (unmatched.length ? ` Sans correspondance : ${unmatched.slice(0, 8).join(", ")}${unmatched.length > 8 ? "..." : ""}.` : "")
    );
    reload();
  }

  async function handleDelete(id: number) {
    if (!confirm("Supprimer ce produit ?")) return;
    await api.delete(`/catalog/products/${id}/`);
    reload();
  }

  async function handleStockChange(productId: number, forStoreId: number, quantity: number, current: number) {
    if (quantity === current) return; // evite de rattacher un produit a un magasin sans le vouloir
    await setStock(productId, forStoreId, quantity);
    reload();
  }

  async function handleExport() {
    const token = getAdminToken();
    const res = await fetch(`${api.defaults.baseURL}/catalog/products/export_excel/${storeId ? `?point_of_sale=${storeId}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = storeId ? `produits_${storeSlug}.xlsx` : "produits_labelleteranga.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("point_of_sale", String(storeId));
    try {
      const res = await api.post("/catalog/products/import_excel/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const errs: string[] = res.data.errors;
      setImportSummary(
        `${store?.name} : ${res.data.created} produit(s) cree(s), ${res.data.updated} mis a jour, ${errs.length} erreur(s).` +
          (errs.length ? ` ${errs.slice(0, 3).join(" | ")}` : "")
      );
    } catch {
      setImportSummary("Import impossible : verifiez le fichier (.xlsx, colonnes sku, name, price).");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    reload();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Produits</h1>
          <p className="text-sm text-gray-500">
            Chaque point de vente a son propre catalogue : choisissez-en un pour voir, importer ou exporter ses produits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!storeId}
            onClick={() =>
              downloadFile(`/catalog/products/import_template/?point_of_sale=${storeId}`, `modele_import_${storeSlug}.xlsx`)
            }
            className="border px-3 py-1.5 rounded text-sm disabled:opacity-40"
          >
            Telecharger le modele
          </button>
          <button onClick={handleExport} className="border px-3 py-1.5 rounded text-sm">
            Exporter Excel
          </button>
          <label
            className="border px-3 py-1.5 rounded text-sm cursor-pointer"
            title="Nommez chaque fichier avec la reference (SKU) ou le nom du produit"
          >
            Ajouter des photos
            <input ref={bulkRef} type="file" accept="image/*" multiple onChange={bulkPhotos} className="hidden" />
          </label>
          <label
            className={`px-3 py-1.5 rounded text-sm ${
              storeId ? "bg-brand text-white cursor-pointer" : "bg-gray-100 text-gray-500 cursor-not-allowed"
            }`}
            title={storeId ? "" : "Choisissez d'abord un point de vente"}
          >
            Importer Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              disabled={!storeId}
              onChange={handleImport}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 border rounded-xl p-1 bg-white">
          {[{ id: null as number | null, name: "Tous" }, ...stores].map((x) => (
            <button
              key={x.id ?? "all"}
              onClick={() => setStoreId(x.id)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                storeId === x.id ? "bg-brand text-white" : "text-gray-500 hover:text-brand"
              }`}
            >
              {x.name.replace(/ La Belle Teranga$/i, "")}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Rechercher un produit ou une reference..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px]"
        />
      </div>
      {!storeId && (
        <p className="text-sm text-gray-500 -mt-4">
          Vue d&apos;ensemble de tous les produits. Pour importer un fichier Excel, choisissez d&apos;abord le point de vente concerne.
        </p>
      )}
      {storeId && (
        <p className="text-sm text-gray-500 -mt-4">
          {products.length} produit(s) rattache(s) a {store?.name}. L&apos;import Excel de ce point de vente ajoute/met a jour ses produits et
          leur stock ici uniquement.
        </p>
      )}

      {photoMsg && <p className="text-sm text-brand-dark bg-brand-light p-2 rounded">{photoMsg}</p>}
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

      {products.length === 0 && (
        <p className="text-sm text-gray-500 py-6 text-center border rounded-lg bg-white">
          {storeId ? "Aucun produit rattache a ce point de vente : importez son fichier Excel." : "Aucun produit."}
        </p>
      )}
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Photo</th>
            <th className="p-2">SKU</th>
            <th className="p-2">Nom</th>
            <th className="p-2">Categorie</th>
            <th className="p-2">Prix</th>
            <th className="p-2">{storeId ? "Stock" : "Stock total"}</th>
            <th className="p-2">Statut</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <React.Fragment key={p.id}>
              {editingId === p.id && editForm ? (
                <tr className="border-t bg-brand-light/40">
                  <td className="p-2" colSpan={8}>
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
                      <div className="sm:col-span-2 flex items-center gap-2">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#251c1a] shrink-0">
                          {editImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={URL.createObjectURL(editImage)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <ProductVisual image={p.image} name={p.name} category={p.category?.name} size="tile" />
                          )}
                        </div>
                        <div className="text-xs space-y-1">
                          <input type="file" accept="image/*" onChange={(e) => setEditImage(e.target.files?.[0] ?? null)} className="text-xs w-full" />
                          {p.image && !editImage && (
                            <button type="button" onClick={() => removePhoto(p)} className="text-red-500">
                              Retirer la photo
                            </button>
                          )}
                        </div>
                      </div>
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
                  <td className="p-2 w-16">
                    <label
                      className="relative block w-12 h-12 rounded-lg overflow-hidden cursor-pointer group bg-[#251c1a]"
                      title="Cliquer pour ajouter ou changer la photo"
                    >
                      <ProductVisual image={p.image} name={p.name} category={p.category?.name} size="tile" />
                      <span className="absolute inset-0 bg-black/65 text-white text-[10px] font-medium flex items-center justify-center text-center leading-tight opacity-0 group-hover:opacity-100 transition">
                        {uploadingId === p.id ? "Envoi..." : p.image ? "Changer" : "+ Photo"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          uploadPhoto(p, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </td>
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
                  <td className="p-2">{storeId ? (p.stocks.find((st) => st.point_of_sale === storeId)?.quantity ?? 0) : p.total_stock}</td>
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
                  <td colSpan={8} className="p-3">
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
                              onBlur={(e) => handleStockChange(p.id, s.id, Number(e.target.value), current)}
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
