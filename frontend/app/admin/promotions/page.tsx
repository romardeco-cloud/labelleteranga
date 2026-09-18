"use client";

import { useEffect, useState } from "react";
import {
  Category,
  PointOfSale,
  Product,
  Promotion,
  api,
  createPromotion,
  deletePromotion,
  fetchCategories,
  fetchPointsOfSale,
  fetchPromotions,
  updatePromotion,
} from "@/lib/api";

function toLocalInput(iso: string) {
  return iso ? iso.slice(0, 16) : "";
}

const emptyForm = {
  name: "",
  discount_type: "percent" as "percent" | "fixed",
  value: "",
  category: "",
  point_of_sale: "",
  start_date: "",
  end_date: "",
};

export default function AdminPromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function reload() {
    fetchPromotions().then(setPromotions);
  }

  useEffect(() => {
    reload();
    fetchCategories().then(setCategories);
    fetchPointsOfSale().then(setStores);
    api.get("/catalog/products/", { params: { page_size: 200 } }).then((res) => setProducts(res.data.results ?? res.data));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPromotion({
        name: form.name,
        discount_type: form.discount_type,
        value: form.value,
        category: form.category ? Number(form.category) : null,
        point_of_sale: form.point_of_sale ? Number(form.point_of_sale) : null,
        products: selectedProducts,
        start_date: new Date(form.start_date).toISOString(),
        end_date: new Date(form.end_date).toISOString(),
        is_active: true,
      });
      setForm(emptyForm);
      setSelectedProducts([]);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(promo: Promotion) {
    await updatePromotion(promo.id, { is_active: !promo.is_active });
    reload();
  }

  async function handleDelete(id: number) {
    if (!confirm("Supprimer cette promotion ?")) return;
    await deletePromotion(id);
    reload();
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Promotions et rabais</h1>

      <form onSubmit={handleCreate} className="bg-white border rounded-lg p-4 space-y-3">
        <div className="grid sm:grid-cols-4 gap-2">
          <input
            required
            placeholder="Nom (ex: Promo rentree)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm sm:col-span-2"
          />
          <select
            value={form.discount_type}
            onChange={(e) => setForm({ ...form, discount_type: e.target.value as "percent" | "fixed" })}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="percent">Pourcentage (%)</option>
            <option value="fixed">Montant fixe (FCFA)</option>
          </select>
          <input
            required
            type="number"
            placeholder={form.discount_type === "percent" ? "Ex: 10" : "Ex: 500"}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div className="grid sm:grid-cols-4 gap-2">
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Toutes categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={form.point_of_sale}
            onChange={(e) => setForm({ ...form, point_of_sale: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          >
            <option value="">Tous points de vente (+ en ligne)</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            required
            type="datetime-local"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          />
          <input
            required
            type="datetime-local"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
          />
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">
            Produits specifiques (optionnel - laisser vide pour appliquer a toute la categorie / tout le catalogue) :
          </p>
          <select
            multiple
            value={selectedProducts.map(String)}
            onChange={(e) => setSelectedProducts(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}
            className="border rounded px-2 py-1.5 text-sm w-full h-28"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <button disabled={saving} className="bg-brand text-white rounded px-4 py-2 text-sm disabled:opacity-50">
          Creer la promotion
        </button>
      </form>

      <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="p-2">Nom</th>
            <th className="p-2">Remise</th>
            <th className="p-2">Portee</th>
            <th className="p-2">Periode</th>
            <th className="p-2">Statut</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {promotions.map((promo) => (
            <tr key={promo.id} className="border-t">
              <td className="p-2 font-medium">{promo.name}</td>
              <td className="p-2">
                {promo.discount_type === "percent" ? `-${promo.value}%` : `-${promo.value} FCFA`}
              </td>
              <td className="p-2 text-xs">
                {promo.product_names.length > 0
                  ? promo.product_names.join(", ")
                  : promo.category_name ?? "Tout le catalogue"}
                {promo.point_of_sale_name && <div className="text-gray-400">@ {promo.point_of_sale_name}</div>}
              </td>
              <td className="p-2 text-xs">
                {toLocalInput(promo.start_date).replace("T", " ")} → {toLocalInput(promo.end_date).replace("T", " ")}
              </td>
              <td className="p-2">
                {promo.is_active ? (promo.is_current ? "En cours" : "Programmee/expiree") : "Desactivee"}
              </td>
              <td className="p-2 text-right space-x-2">
                <button onClick={() => toggleActive(promo)} className="text-brand text-xs underline">
                  {promo.is_active ? "Desactiver" : "Reactiver"}
                </button>
                <button onClick={() => handleDelete(promo.id)} className="text-red-500 text-xs">
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
