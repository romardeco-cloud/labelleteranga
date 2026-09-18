"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PointOfSale, fetchPointsOfSale } from "@/lib/api";
import {
  InventoryCount,
  MOVEMENT_REASONS,
  StockMovement,
  apiErrorMessage,
  createInventory,
  formatDate,
  formatXof,
  listInventories,
  listMovements,
} from "@/lib/documents";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  validated: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
};

const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"counts" | "movements">("counts");
  const [stores, setStores] = useState<PointOfSale[]>([]);

  useEffect(() => {
    fetchPointsOfSale().then((s) => setStores(s.filter((x) => x.is_active)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventaire</h1>
        <p className="text-sm text-gray-500">
          Comptez le stock physique de chaque point de vente, comparez-le au stock theorique et corrigez les ecarts.
        </p>
      </div>

      <div className="flex gap-2 border-b">
        {(
          [
            ["counts", "Inventaires"],
            ["movements", "Mouvements de stock"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
              tab === key ? "border-brand text-brand" : "border-transparent text-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "counts" ? (
        <CountsTab stores={stores} onCreated={(id) => router.push(`/admin/inventory/${id}`)} />
      ) : (
        <MovementsTab stores={stores} />
      )}
    </div>
  );
}

function CountsTab({ stores, onCreated }: { stores: PointOfSale[]; onCreated: (id: number) => void }) {
  const [rows, setRows] = useState<InventoryCount[]>([]);
  const [storeId, setStoreId] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listInventories().then(setRows);
  }, []);
  useEffect(() => {
    if (!storeId && stores.length) setStoreId(String(stores[0].id));
  }, [stores, storeId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const inv = await createInventory({ point_of_sale: Number(storeId), date });
      onCreated(inv.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Point de vente</span>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="border rounded px-3 py-2">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-500 mb-1">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-3 py-2" />
        </label>
        <button disabled={busy || !storeId} className="bg-brand text-white px-4 py-2 rounded text-sm disabled:opacity-50">
          {busy ? "Creation..." : "Nouvel inventaire"}
        </button>
        {error && <p className="text-sm text-red-600 w-full">{error}</p>}
      </form>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="p-3">Numero</th>
              <th className="p-3">Date</th>
              <th className="p-3">Point de vente</th>
              <th className="p-3">Statut</th>
              <th className="p-3 text-right">Comptes</th>
              <th className="p-3 text-right">Ecart (unites)</th>
              <th className="p-3 text-right">Ecart (valeur)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="p-3">
                  <Link href={`/admin/inventory/${r.id}`} className="text-brand font-medium">
                    {r.number}
                  </Link>
                </td>
                <td className="p-3">{formatDate(r.date)}</td>
                <td className="p-3">{r.point_of_sale_name}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_STYLE[r.status]}`}>{r.status_label}</span>
                </td>
                <td className="p-3 text-right">
                  {r.counted_count} / {r.lines_count}
                </td>
                <td className={`p-3 text-right ${r.variance_units < 0 ? "text-red-600" : r.variance_units > 0 ? "text-green-700" : ""}`}>
                  {r.variance_units > 0 ? "+" : ""}
                  {r.variance_units}
                </td>
                <td className="p-3 text-right">{formatXof(r.variance_value)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-gray-500">
                  Aucun inventaire pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MovementsTab({ stores }: { stores: PointOfSale[] }) {
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [store, setStore] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const pageSize = 50;

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, page_size: pageSize };
    if (store) params.point_of_sale = store;
    if (reason) params.reason = reason;
    if (search) params.search = search;
    if (start) params.start = start;
    if (end) params.end = end;
    listMovements(params)
      .then((d) => {
        setRows(d.results);
        setCount(d.count);
      })
      .finally(() => setLoading(false));
  }, [page, store, reason, search, start, end]);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setPage(1);
    setter(v);
  };
  const pages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-lg p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        <input
          type="search"
          placeholder="Produit, SKU ou piece..."
          value={search}
          onChange={(e) => reset(setSearch)(e.target.value)}
          className="border rounded px-3 py-2"
        />
        <select value={store} onChange={(e) => reset(setStore)(e.target.value)} className="border rounded px-3 py-2">
          <option value="">Tous les points de vente</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={reason} onChange={(e) => reset(setReason)(e.target.value)} className="border rounded px-3 py-2">
          <option value="">Tous les motifs</option>
          {MOVEMENT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <input type="date" value={start} onChange={(e) => reset(setStart)(e.target.value)} className="border rounded px-3 py-2" />
        <input type="date" value={end} onChange={(e) => reset(setEnd)(e.target.value)} className="border rounded px-3 py-2" />
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Produit</th>
              <th className="p-3">Point de vente</th>
              <th className="p-3">Motif</th>
              <th className="p-3 text-right">Variation</th>
              <th className="p-3 text-right">Stock apres</th>
              <th className="p-3">Piece</th>
              <th className="p-3">Utilisateur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3 whitespace-nowrap">
                  {formatDate(m.created_at)} {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="p-3">
                  {m.product_name} <span className="text-gray-400">({m.product_sku})</span>
                </td>
                <td className="p-3">{m.point_of_sale_name}</td>
                <td className="p-3">{m.reason_label}</td>
                <td className={`p-3 text-right font-medium ${m.delta < 0 ? "text-red-600" : "text-green-700"}`}>
                  {m.delta > 0 ? "+" : ""}
                  {m.delta}
                </td>
                <td className="p-3 text-right">{m.quantity_after}</td>
                <td className="p-3">{m.reference}</td>
                <td className="p-3">{m.user_username ?? "-"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Aucun mouvement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{count} mouvements</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="border rounded px-3 py-1 disabled:opacity-40">
            Precedent
          </button>
          <span>
            Page {page} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="border rounded px-3 py-1 disabled:opacity-40">
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
