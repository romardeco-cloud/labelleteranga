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
import { apiErrorMessage, downloadFile } from "@/lib/documents";

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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "hidden">("all");
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [photoMsg, setPhotoMsg] = useState("");
  const [photoErr, setPhotoErr] = useState("");
  const bulkRef = useRef<HTMLInputElement>(null);
  // --- actions groupees ---
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkKind, setBulkKind] = useState<null | "price" | "stock" | "delete" | "category" | "assign">(null);
  const [assignTarget, setAssignTarget] = useState("");
  const [assignMode, setAssignMode] = useState<"move" | "copy">("move");
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // "" = toutes, "none" = sans categorie, sinon id
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkCategoryName, setBulkCategoryName] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkActivate, setBulkActivate] = useState(true);
  const [bulkQty, setBulkQty] = useState("");
  const [bulkMode, setBulkMode] = useState<"set" | "add">("set");
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [imgStatus, setImgStatus] = useState<{ backend: string; ok: boolean; detail: string } | null>(null);
  const store = stores.find((x) => x.id === storeId) ?? null;
  const storeSlug = store ? store.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";

  function reload() {
    api
      .get("/catalog/products/", {
        params: {
          page_size: 500,
          ...(storeId ? { point_of_sale: storeId } : {}),
          ...(search ? { search } : {}),
          ...(categoryFilter === "none" ? { no_category: 1 } : categoryFilter ? { category: categoryFilter } : {}),
          ...(statusFilter !== "all" ? { is_active: statusFilter === "active" ? "true" : "false" } : {}),
        },
      })
      .then((res) => setProducts(res.data.results ?? res.data));
  }

  useEffect(() => {
    fetchPointsOfSale().then((list) => setStores(list.filter((x) => x.is_active)));
    fetchCategories().then(setCategories);
    api
      .get("/catalog/products/image-storage/")
      .then((res) => setImgStatus(res.data))
      .catch(() => setImgStatus(null));
  }, []);

  async function runBulk(action: string, extra: Record<string, unknown> = {}) {
    return runBulkFor([...selected], action, extra);
  }
  async function runBulkFor(ids: number[], action: string, extra: Record<string, unknown> = {}) {
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await api.post("/catalog/products/bulk-update/", { ids, action, point_of_sale: storeId, ...extra });
      const { updated, skipped, skipped_reason } = res.data as { updated: number; skipped: number; skipped_reason?: string };
      const why = skipped_reason?.replace(/^ - /, "") ?? "";
      let text = `${updated} produit(s) modifie(s)${skipped ? ` ; ${skipped} ignore(s)` : ""}${why ? ` (${why})` : ""}.`;
      if (action === "activate" && skipped) {
        text = `${updated} produit(s) active(s). ${skipped} non active(s) :`;
        if (why.includes("prix a 0")) text += " leur prix est a 0 FCFA - donnez-leur d'abord un prix avec « Prix uniforme » (case « Activer aussi »), ou modifiez le prix produit par produit.";
        if (why.includes("partage")) text += " certains sont aussi vendus par un autre point de vente : leur statut est commun, changez-le depuis la ligne du produit.";
        if (why.includes("hors de ce point")) text += " certains ne sont pas dans ce point de vente.";
      }
      setBulkMsg({ ok: !(action === "activate" && skipped && !updated), text });
      setBulkKind(null);
      setBulkConfirm("");
      if (action === "delete" || (action === "assign_store" && extra.mode === "move")) setSelected(new Set());
      setBulkKind(null);
      reload();
    } catch (err) {
      setBulkMsg({ ok: false, text: apiErrorMessage(err, "Action impossible.") });
    } finally {
      setBulkBusy(false);
    }
  }
  const toggleOne = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));

  useEffect(() => {
    const t = setTimeout(reload, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, search, statusFilter, categoryFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const data = new FormData();
    Object.entries(form).forEach(([k, v]) => v && data.append(k, v));
    if (newImage) data.append("image", await prepareImage(newImage));
    try {
      const created = await api.post("/catalog/products/", data, { headers: { "Content-Type": "multipart/form-data" } });
      if (storeId) await setStock(created.data.id, storeId, 0); // rattache le nouveau produit au point de vente choisi
      setForm(emptyForm);
      setNewImage(null);
      setPhotoMsg("");
      setPhotoErr("");
      reload();
    } catch (err) {
      setPhotoErr(apiErrorMessage(err, "Le produit n'a pas pu etre enregistre."));
    }
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
    try {
      await updateProduct(id, data);
      setEditingId(null);
      setEditForm(null);
      setPhotoMsg("");
      setPhotoErr("");
      reload();
    } catch (err) {
      setPhotoErr(apiErrorMessage(err, "Modification non enregistree."));
    }
  }

  async function uploadPhoto(p: Product, file: File | undefined) {
    if (!file) return;
    setUploadingId(p.id);
    setPhotoMsg("");
      setPhotoErr("");
    try {
      const data = new FormData();
      data.append("image", await prepareImage(file));
      await updateProduct(p.id, data);
      reload();
    } catch (err) {
      setPhotoErr(`Photo de "${p.name}" : ${apiErrorMessage(err, "envoi impossible.")}`);
    } finally {
      setUploadingId(null);
    }
  }

  async function removePhoto(p: Product) {
    if (!confirm(`Retirer la photo de "${p.name}" ?`)) return;
    const data = new FormData();
    data.append("image", "");
    try {
      await updateProduct(p.id, data);
      reload();
    } catch (err) {
      setPhotoErr(apiErrorMessage(err, "Impossible de retirer la photo."));
    }
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
      } catch (err) {
        unmatched.push(`${f.name} (${apiErrorMessage(err, "echec de l'envoi").slice(0, 80)})`);
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
        <div className="flex gap-1 border rounded-xl p-1 bg-white">
          {(
            [
              ["all", "Tous"],
              ["active", "En caisse"],
              ["hidden", "Masques"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm ${statusFilter === key ? "bg-brand text-white" : "text-gray-500 hover:text-brand"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setSelected(new Set());
          }}
          className="border rounded-xl px-3 py-2 text-sm bg-white"
          aria-label="Filtrer par categorie"
        >
          <option value="">Toutes les categories</option>
          <option value="none">Sans categorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {storeId && statusFilter === "hidden" && products.length > 0 && (
          <button
            onClick={async () => {
              if (!confirm("Activer tous les produits masques de ce point de vente qui ont un prix ?")) return;
              const res = await api.post("/catalog/products/bulk-activate/", { point_of_sale: storeId });
              setPhotoMsg(
                `${res.data.activated} produit(s) active(s).` +
                  (res.data.still_hidden_without_price ? ` ${res.data.still_hidden_without_price} reste(nt) masque(s) : prix a renseigner.` : "")
              );
              reload();
            }}
            className="border border-brand text-brand rounded-lg px-3 py-2 text-sm"
          >
            Activer les produits masques avec un prix
          </button>
        )}
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

      {imgStatus && !imgStatus.ok && (
        <p className="text-sm bg-red-50 text-red-700 border border-red-200 p-3 rounded">
          <strong>Stockage des photos : </strong>
          {imgStatus.detail}
        </p>
      )}
      {imgStatus?.ok && <p className="text-xs text-green-700">Stockage des photos : {imgStatus.detail}</p>}
      {photoErr && <p className="text-sm bg-red-50 text-red-700 border border-red-200 p-3 rounded">{photoErr}</p>}
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
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggleAll} disabled={products.length === 0} className="border rounded-lg px-3 py-1.5 text-sm bg-white disabled:opacity-40">
          {allSelected ? "Tout deselectionner" : `Tout selectionner (${products.length})`}
        </button>
        {storeId && products.some((x) => !x.category) && (
          <button
            onClick={() => {
              setSelected(new Set(products.filter((x) => !x.category).map((x) => x.id)));
              setTimeout(() => runBulkFor(products.filter((x) => !x.category).map((x) => x.id), "auto_category"), 0);
            }}
            disabled={bulkBusy}
            className="border border-brand text-brand rounded-lg px-3 py-1.5 text-sm bg-white"
            title="Range automatiquement les produits sans categorie d'apres leur nom"
          >
            Classer automatiquement ({products.filter((x) => !x.category).length} sans categorie)
          </button>
        )}
        {selected.size > 0 && !storeId && (
          <span className="text-sm text-amber-500">
            {selected.size} selectionne(s) : choisissez d&apos;abord un point de vente (boutons ci-dessus) - les modifications ne s&apos;appliquent qu&apos;a lui.
          </span>
        )}
        {selected.size > 0 && storeId && (
          <>
            <span className="text-sm font-medium">
              {selected.size} selectionne(s) - applique uniquement a <strong>{store?.name.replace(/ La Belle Teranga$/i, "")}</strong> :
            </span>
            <button onClick={() => runBulk("activate")} disabled={bulkBusy} className="border border-green-600 text-green-700 rounded-lg px-3 py-1.5 text-sm bg-white">
              Activer
            </button>
            <button onClick={() => runBulk("deactivate")} disabled={bulkBusy} className="border rounded-lg px-3 py-1.5 text-sm bg-white">
              Desactiver
            </button>
            <button onClick={() => setBulkKind("price")} className="border rounded-lg px-3 py-1.5 text-sm bg-white">
              Meme prix pour tous
            </button>
            <button onClick={() => setBulkKind("stock")} className="border rounded-lg px-3 py-1.5 text-sm bg-white">
              Stock uniforme
            </button>
            <button onClick={() => runBulk("set_tracking", { track: true })} disabled={bulkBusy} className="border rounded-lg px-3 py-1.5 text-sm bg-white" title="Le stock de ces produits est decompte a chaque vente">
              Suivre le stock
            </button>
            <button onClick={() => runBulk("set_tracking", { track: false })} disabled={bulkBusy} className="border rounded-lg px-3 py-1.5 text-sm bg-white" title="Toujours disponible : jamais de rupture ni de sortie de stock">
              Ne pas suivre le stock
            </button>
            <button onClick={() => setBulkKind("assign")} className="border rounded-lg px-3 py-1.5 text-sm bg-white">
              Affecter a un autre point de vente
            </button>
            <button onClick={() => setBulkKind("category")} className="border rounded-lg px-3 py-1.5 text-sm bg-white">
              Categorie
            </button>
            <button onClick={() => setBulkKind("delete")} className="border border-red-500 text-red-600 rounded-lg px-3 py-1.5 text-sm bg-white">
              Supprimer
            </button>
          </>
        )}
      </div>
      {bulkMsg && <p className={`text-sm ${bulkMsg.ok ? "text-green-700" : "text-red-600"}`}>{bulkMsg.text}</p>}
      {bulkKind && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setBulkKind(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white text-gray-900 rounded-2xl p-5 w-full max-w-sm space-y-3">
            {bulkKind === "price" && (
              <>
                <h2 className="font-bold text-lg">Meme prix pour {selected.size} produit(s)</h2>
                <input type="number" min={0} autoFocus value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} placeholder="Prix (FCFA)" className="w-full border rounded px-3 py-2" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={bulkActivate} onChange={(e) => setBulkActivate(e.target.checked)} /> Activer aussi ces produits (visibles en caisse et en ligne)
                </label>
                <button disabled={bulkBusy || bulkPrice === ""} onClick={() => runBulk("set_price", { price: bulkPrice, activate: bulkActivate })} className="w-full bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-40">
                  {bulkBusy ? "Application..." : "Appliquer ce prix"}
                </button>
              </>
            )}
            {bulkKind === "stock" && (
              <>
                <h2 className="font-bold text-lg">Stock pour {selected.size} produit(s)</h2>
                {storeId ? (
                  <>
                    <p className="text-sm text-gray-600">Point de vente : <strong>{store?.name}</strong></p>
                    <div className="flex gap-2 text-sm">
                      {(
                        [
                          ["set", "Mettre le stock a"],
                          ["add", "Ajouter au stock"],
                        ] as const
                      ).map(([k, l]) => (
                        <button key={k} onClick={() => setBulkMode(k)} className={`flex-1 border rounded-lg py-1.5 ${bulkMode === k ? "bg-brand text-white border-brand" : ""}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                    <input type="number" autoFocus value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} placeholder="Quantite" className="w-full border rounded px-3 py-2" />
                    <button disabled={bulkBusy || bulkQty === ""} onClick={() => runBulk("set_stock", { quantity: Number(bulkQty), mode: bulkMode })} className="w-full bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-40">
                      {bulkBusy ? "Application..." : bulkMode === "add" ? "Ajouter cette quantite" : "Appliquer ce stock"}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-amber-700">Choisissez d&apos;abord un point de vente (boutons en haut de la liste) : le stock se gere par point de vente.</p>
                )}
              </>
            )}
            {bulkKind === "assign" && (
              <>
                <h2 className="font-bold text-lg">Affecter {selected.size} produit(s) a un autre point de vente</h2>
                <p className="text-sm text-gray-600">
                  Depuis : <strong>{store?.name}</strong>
                </p>
                <select value={assignTarget} onChange={(e) => setAssignTarget(e.target.value)} className="w-full border rounded px-3 py-2">
                  <option value="">Choisir le point de vente de destination...</option>
                  {stores
                    .filter((s) => s.id !== storeId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(
                    [
                      ["move", "Deplacer", "quitte ce point de vente, le stock suit"],
                      ["copy", "Ajouter aussi", "reste ici et devient aussi vendu la-bas"],
                    ] as const
                  ).map(([k, l, hint]) => (
                    <button key={k} onClick={() => setAssignMode(k)} className={`border rounded-lg p-2 text-left ${assignMode === k ? "border-brand bg-brand-light" : ""}`}>
                      <span className="block font-medium">{l}</span>
                      <span className="block text-xs text-gray-500">{hint}</span>
                    </button>
                  ))}
                </div>
                {assignMode === "copy" && (
                  <p className="text-xs text-amber-700">Un produit vendu par deux points de vente partage le meme prix, statut et categorie ; son stock reste propre a chaque point de vente.</p>
                )}
                <button
                  disabled={bulkBusy || !assignTarget}
                  onClick={() => runBulk("assign_store", { target_point_of_sale: Number(assignTarget), mode: assignMode })}
                  className="w-full bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
                >
                  {bulkBusy ? "Application..." : assignMode === "move" ? "Deplacer les produits" : "Ajouter a ce point de vente"}
                </button>
              </>
            )}
            {bulkKind === "category" && (
              <>
                <h2 className="font-bold text-lg">Categorie pour {selected.size} produit(s)</h2>
                <select value={bulkCategory} onChange={(e) => { setBulkCategory(e.target.value); setBulkCategoryName(""); }} className="w-full border rounded px-3 py-2">
                  <option value="">Choisir une categorie...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input value={bulkCategoryName} onChange={(e) => { setBulkCategoryName(e.target.value); setBulkCategory(""); }} placeholder="ou creer une nouvelle categorie" className="w-full border rounded px-3 py-2" />
                <button
                  disabled={bulkBusy || (!bulkCategory && !bulkCategoryName.trim())}
                  onClick={async () => {
                    await runBulk("set_category", bulkCategory ? { category: Number(bulkCategory) } : { category_name: bulkCategoryName.trim() });
                    fetchCategories().then(setCategories);
                  }}
                  className="w-full bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
                >
                  {bulkBusy ? "Application..." : "Appliquer cette categorie"}
                </button>
              </>
            )}
            {bulkKind === "delete" && (
              <>
                <h2 className="font-bold text-lg text-red-600">Supprimer {selected.size} produit(s) ?</h2>
                <p className="text-sm text-gray-600">Suppression definitive de ces produits, de leur stock et de leurs photos. Les ventes passees restent dans les rapports.</p>
                <label className="block text-sm">
                  Tapez <strong>SUPPRIMER</strong> pour confirmer
                  <input value={bulkConfirm} onChange={(e) => setBulkConfirm(e.target.value)} className="w-full border rounded px-3 py-2 mt-1" />
                </label>
                <button disabled={bulkBusy || bulkConfirm.trim().toUpperCase() !== "SUPPRIMER"} onClick={() => runBulk("delete", { confirm: true })} className="w-full bg-red-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-40">
                  {bulkBusy ? "Suppression..." : "Supprimer definitivement"}
                </button>
              </>
            )}
            <button onClick={() => setBulkKind(null)} className="w-full border rounded-lg py-2 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2 w-8">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Tout selectionner" />
            </th>
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
                  <td className="p-2" colSpan={9}>
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
                <tr className={`border-t ${selected.has(p.id) ? "bg-brand-light/60" : ""}`}>
                  <td className="p-2 w-8">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Selectionner ${p.name}`} />
                  </td>
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
                  <td className="p-2">
                    <select
                      value={p.category?.id ?? ""}
                      onChange={async (e) => {
                        try {
                          await api.patch(`/catalog/products/${p.id}/`, { category_id: e.target.value ? Number(e.target.value) : null });
                          reload();
                        } catch (err) {
                          setPhotoErr(apiErrorMessage(err, "Categorie non modifiee."));
                        }
                      }}
                      className="border rounded px-1 py-0.5 text-xs max-w-[160px] bg-transparent"
                      aria-label={`Categorie de ${p.name}`}
                    >
                      <option value="">- Sans categorie -</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
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
                  <td className="p-2">
                    {(() => {
                      const row = storeId ? p.stocks.find((st) => st.point_of_sale === storeId) : undefined;
                      const storeUntracked = !!store && store.track_stock === false;
                      const tracked = !storeUntracked && row?.track_stock !== false;
                      return (
                        <div className="space-y-1">
                          <div>{!tracked && storeId ? <span className="text-xs text-gray-500">Non suivi</span> : storeId ? (row?.quantity ?? 0) : p.total_stock}</div>
                          {storeId && !storeUntracked && (
                            <select
                              value={tracked ? "yes" : "no"}
                              onChange={async (e) => {
                                try {
                                  await api.post("/catalog/products/bulk-update/", { ids: [p.id], point_of_sale: storeId, action: "set_tracking", track: e.target.value === "yes" });
                                  reload();
                                } catch (err) {
                                  setPhotoErr(apiErrorMessage(err, "Suivi du stock non modifie."));
                                }
                              }}
                              className="border rounded px-1 py-0.5 text-xs bg-transparent"
                              aria-label={`Suivi du stock de ${p.name}`}
                            >
                              <option value="yes">Stock suivi</option>
                              <option value="no">Stock non suivi</option>
                            </select>
                          )}
                          {storeUntracked && <div className="text-[10px] text-gray-500">(suivi desactive pour ce point de vente)</div>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-2">
                    <select
                      value={p.is_active ? "on" : "off"}
                      onChange={async (e) => {
                        const active = e.target.value === "on";
                        if (active && Number(p.price) <= 0 && !confirm(`« ${p.name} » a un prix de 0 FCFA : il serait vendu gratuitement. L'activer quand meme ?`)) return;
                        if (p.stocks.length > 1 && !confirm(`« ${p.name} » est vendu par ${p.stocks.length} points de vente : le statut change pour tous. Continuer ?`)) return;
                        try {
                          await api.patch(`/catalog/products/${p.id}/`, { is_active: active });
                          reload();
                        } catch (err) {
                          setPhotoErr(apiErrorMessage(err, "Statut non modifie."));
                        }
                      }}
                      className={`border rounded px-1 py-0.5 text-xs bg-transparent ${p.is_active ? "text-green-600" : "text-gray-500"}`}
                      aria-label={`Statut de ${p.name}`}
                    >
                      <option value="on">Actif</option>
                      <option value="off">Desactive</option>
                    </select>
                  </td>
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
                  <td colSpan={9} className="p-3">
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
