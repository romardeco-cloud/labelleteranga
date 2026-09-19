"use client";

import SealBlock from "@/components/SealBlock";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  InventoryCount,
  apiErrorMessage,
  deleteInventory,
  downloadFile,
  formatDate,
  formatXof,
  getInventory,
  importInventoryCounts,
  openPdf,
  inventoryAction,
  saveInventoryCounts,
} from "@/lib/documents";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  validated: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inv, setInv] = useState<InventoryCount | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function load(data: InventoryCount) {
    setInv(data);
    const v: Record<number, string> = {};
    data.lines?.forEach((l) => (v[l.product] = l.counted_quantity === null ? "" : String(l.counted_quantity)));
    setValues(v);
    setDirty(new Set());
  }

  useEffect(() => {
    getInventory(id).then(load);
  }, [id]);

  const editable = inv?.status === "draft";

  const lines = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (inv?.lines ?? []).filter((l) => {
      if (q && !(l.product_name.toLowerCase().includes(q) || l.product_sku.toLowerCase().includes(q))) return false;
      if (onlyGaps) {
        const v = values[l.product];
        return v !== "" && v !== undefined && Number(v) !== l.theoretical_quantity;
      }
      return true;
    });
  }, [inv, search, onlyGaps, values]);

  // Totaux calcules en direct a partir des saisies (avant enregistrement)
  const totals = useMemo(() => {
    let counted = 0;
    let units = 0;
    let value = 0;
    (inv?.lines ?? []).forEach((l) => {
      const raw = editable ? values[l.product] : l.counted_quantity === null ? "" : String(l.counted_quantity);
      if (raw === "" || raw === undefined) return;
      counted += 1;
      const gap = Number(raw) - l.theoretical_quantity;
      units += gap;
      value += gap * Number(l.unit_price);
    });
    return { counted, units, value };
  }, [inv, values, editable]);

  function setValue(product: number, v: string) {
    if (v !== "" && !/^\d+$/.test(v)) return;
    setValues((prev) => ({ ...prev, [product]: v }));
    setDirty((prev) => new Set(prev).add(product));
  }

  async function persist() {
    if (!inv || dirty.size === 0) return inv;
    const counts = Array.from(dirty).map((product) => ({
      product,
      counted_quantity: values[product] === "" ? null : Number(values[product]),
    }));
    const data = await saveInventoryCounts(inv.id, counts);
    load(data);
    return data;
  }

  async function run(fn: () => Promise<void>, okText?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ type: "ok", text: okText });
    } catch (err) {
      setMsg({ type: "err", text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(async () => void (await persist()), "Comptage enregistre.");

  const validate = () => {
    if (!inv) return;
    if (
      !confirm(
        `Valider l'inventaire ${inv.number} ?\n\nLe stock de ${totals.counted} produit(s) compte(s) sera remplace par les quantites comptees. Cette action est definitive.`
      )
    )
      return;
    run(async () => {
      await persist();
      const data = await inventoryAction(inv.id, "validate");
      load(data);
      setMsg({
        type: "ok",
        text:
          `Inventaire valide : le stock a ete ajuste.` +
          (data.moved_since_snapshot
            ? ` Attention : ${data.moved_since_snapshot} produit(s) avaient bouge depuis la creation de l'inventaire (ventes ou receptions) ; le stock a ete aligne sur votre comptage.`
            : ""),
      });
    });
  };

  const cancel = () => {
    if (!inv || !confirm("Annuler cet inventaire ? Aucun stock ne sera modifie.")) return;
    run(async () => load(await inventoryAction(inv.id, "cancel")), "Inventaire annule.");
  };

  const remove = () => {
    if (!inv || !confirm("Supprimer definitivement cet inventaire ?")) return;
    run(async () => {
      await deleteInventory(inv.id);
      router.push("/admin/inventory");
    });
  };

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !inv) return;
    run(async () => {
      const data = await importInventoryCounts(inv.id, file);
      load(data);
      const r = data.import_result;
      setMsg({
        type: r && r.errors.length ? "err" : "ok",
        text: `${r?.updated ?? 0} comptage(s) importe(s).` + (r?.errors.length ? ` ${r.errors.slice(0, 5).join(" ")}` : ""),
      });
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!inv) return <p className="text-gray-500">Chargement...</p>;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link href="/admin/inventory" className="text-sm text-gray-500">
          &larr; Inventaires
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {inv.number}{" "}
            <span className={`ml-2 align-middle px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[inv.status]}`}>
              {inv.status_label}
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            {inv.point_of_sale_name} &middot; {formatDate(inv.date)}
            {inv.created_by_username ? ` · cree par ${inv.created_by_username}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            onClick={() => downloadFile(`/stores/inventories/${inv.id}/export/`, `feuille_comptage_${inv.number}.xlsx`)}
            className="border px-3 py-1.5 rounded text-sm"
          >
            Feuille de comptage Excel
          </button>
          {editable && (
            <label className="border px-3 py-1.5 rounded text-sm cursor-pointer">
              Importer les comptages
              <input ref={fileRef} type="file" accept=".xlsx" onChange={onImport} className="hidden" />
            </label>
          )}
          <button onClick={() => openPdf(`/stores/inventories/${inv.id}/pdf/`).catch(() => alert("PDF impossible."))} className="bg-brand text-white px-3 py-1.5 rounded text-sm">
            PDF
          </button>
          <button onClick={() => window.print()} className="border px-3 py-1.5 rounded text-sm">
            Imprimer
          </button>
        </div>
      </div>

      {msg && (
        <p className={`text-sm p-3 rounded ${msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Produits" value={String(inv.lines_count)} />
        <Kpi label="Produits comptes" value={`${totals.counted} / ${inv.lines_count}`} />
        <Kpi
          label="Ecart net (unites)"
          value={`${totals.units > 0 ? "+" : ""}${totals.units}`}
          tone={totals.units < 0 ? "red" : totals.units > 0 ? "green" : undefined}
        />
        <Kpi
          label="Ecart net (valeur)"
          value={formatXof(totals.value)}
          tone={totals.value < 0 ? "red" : totals.value > 0 ? "green" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <input
          type="search"
          placeholder="Rechercher un produit ou SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm flex-1 min-w-[220px]"
        />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} />
          Uniquement les ecarts
        </label>
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="p-3">SKU</th>
              <th className="p-3">Produit</th>
              <th className="p-3">Categorie</th>
              <th className="p-3 text-right">Theorique</th>
              <th className="p-3 text-right">Compte</th>
              <th className="p-3 text-right">Ecart</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const raw = editable ? values[l.product] : l.counted_quantity === null ? "" : String(l.counted_quantity);
              const gap = raw === "" || raw === undefined ? null : Number(raw) - l.theoretical_quantity;
              return (
                <tr key={l.id} className="border-t">
                  <td className="p-3 text-gray-500">{l.product_sku}</td>
                  <td className="p-3">{l.product_name}</td>
                  <td className="p-3 text-gray-500">{l.category ?? "-"}</td>
                  <td className="p-3 text-right">{l.theoretical_quantity}</td>
                  <td className="p-3 text-right">
                    {editable ? (
                      <input
                        inputMode="numeric"
                        value={values[l.product] ?? ""}
                        onChange={(e) => setValue(l.product, e.target.value)}
                        className="w-24 border rounded px-2 py-1 text-right print:border-0"
                        placeholder="-"
                      />
                    ) : (
                      (raw || "-")
                    )}
                  </td>
                  <td
                    className={`p-3 text-right font-medium ${
                      gap === null || gap === 0 ? "text-gray-400" : gap < 0 ? "text-red-600" : "text-green-700"
                    }`}
                  >
                    {gap === null ? "-" : gap > 0 ? `+${gap}` : gap}
                  </td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  Aucun produit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="flex flex-wrap gap-2 print:hidden sticky bottom-0 bg-white/90 backdrop-blur py-3 border-t">
          <button onClick={save} disabled={busy || dirty.size === 0} className="border px-4 py-2 rounded text-sm disabled:opacity-40">
            Enregistrer le comptage{dirty.size ? ` (${dirty.size})` : ""}
          </button>
          <button onClick={validate} disabled={busy || totals.counted === 0} className="bg-brand text-white px-4 py-2 rounded text-sm disabled:opacity-40">
            Valider et ajuster le stock
          </button>
          <button onClick={cancel} disabled={busy} className="text-gray-600 px-3 py-2 text-sm">
            Annuler l&apos;inventaire
          </button>
          <button onClick={remove} disabled={busy} className="text-red-600 px-3 py-2 text-sm ml-auto">
            Supprimer
          </button>
        </div>
      )}
      {inv.status === "cancelled" && (
        <div className="print:hidden">
          <button onClick={remove} className="text-red-600 text-sm">
            Supprimer
          </button>
        </div>
      )}
      <SealBlock printOnly />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${tone === "red" ? "text-red-600" : tone === "green" ? "text-green-700" : ""}`}>{value}</p>
    </div>
  );
}
