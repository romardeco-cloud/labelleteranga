"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PointOfSale, api, fetchPointsOfSale } from "@/lib/api";
import { apiErrorMessage, formatXof } from "@/lib/documents";

type Row = {
  line: number;
  source: string;
  sku: string;
  name: string;
  category: string;
  price: string | null;
  stock: number | null;
  is_active: boolean;
  action: "create" | "update";
  image_index?: number;
  image_url?: string;
  warning?: string;
};
type Analysis = {
  job_id: string;
  documents: { name: string; kind: string }[];
  warnings: string[];
  total_rows: number;
  create: number;
  update: number;
  images_total: number;
  images_matched: number;
  images_unmatched: string[];
  image_names: string[];
  rows: Row[];
};
type Result = { created: number; updated: number; attached: number; errors: string[]; pending: number };

const ACCEPT = ".xlsx,.xlsm,.csv,.tsv,.txt,.json,.pdf,.docx,.zip,.jpg,.jpeg,.png,.webp,.gif,.jfif,.bmp";
const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);

export default function ImportPage() {
  const [stores, setStores] = useState<PointOfSale[]>([]);
  const [storeId, setStoreId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fromImages, setFromImages] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState<"" | "analyze" | "import">("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPointsOfSale().then((l) => setStores(l.filter((s) => s.is_active)));
  }, []);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    setFiles((cur) => [...cur, ...incoming.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))]);
    setAnalysis(null);
    setResult(null);
    setError("");
  }

  async function analyze() {
    setBusy("analyze");
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("step", "analyze");
      if (storeId) form.append("point_of_sale", storeId);
      form.append("create_from_images", String(fromImages));
      files.forEach((f) => form.append("files", f));
      const res = await api.post<Analysis>("/catalog/products/smart-import/", form, { timeout: 180000 });
      setAnalysis(res.data);
    } catch (err) {
      setAnalysis(null);
      setError(apiErrorMessage(err, "Analyse impossible."));
    } finally {
      setBusy("");
    }
  }

  async function runImport() {
    if (!analysis) return;
    setBusy("import");
    setError("");
    try {
      const step = (s: string) => {
        const f = new FormData();
        f.append("step", s);
        f.append("job_id", analysis.job_id);
        return api.post("/catalog/products/smart-import/", f, { timeout: 120000 });
      };
      const rows = (await step("rows")).data as { created: number; updated: number; errors: string[]; images_pending: number };
      const total = rows.images_pending;
      setProgress({ done: 0, total });
      let attached = 0;
      let errors = [...rows.errors];
      let remaining = total;
      while (remaining > 0) {
        const r = (await step("images")).data as { attached: number; remaining: number; errors: string[]; done: boolean };
        attached = r.attached;
        remaining = r.remaining;
        errors = [...new Set([...errors, ...r.errors])];
        setProgress({ done: total - remaining, total });
        if (r.done) break;
      }
      setResult({ created: rows.created, updated: rows.updated, attached, errors, pending: 0 });
      setAnalysis(null);
      setFiles([]);
    } catch (err) {
      setError(apiErrorMessage(err, "Import interrompu. Vous pouvez relancer l'analyse et recommencer : les produits deja importes sont simplement mis a jour."));
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Importer des produits et des photos</h1>
        <p className="text-sm text-gray-500">
          Deposez vos documents : le systeme lit les produits, detecte les colonnes, cree les categories et associe automatiquement chaque photo a son produit.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="border rounded-2xl bg-[#1c1514] p-4">
          <p className="font-medium mb-1">Documents acceptes</p>
          <p className="text-gray-400">Excel (.xlsx), CSV, JSON, PDF (tableau ou menu), Word (.docx), texte (.txt), archive ZIP.</p>
        </div>
        <div className="border rounded-2xl bg-[#1c1514] p-4">
          <p className="font-medium mb-1">Photos</p>
          <p className="text-gray-400">
            JPG, PNG, WebP, dans un ZIP ou directement. Nommez chaque photo comme le produit (ou son SKU) : « Yassa poulet.jpg ». Une image collee dans une
            cellule Excel est aussi associee a sa ligne.
          </p>
        </div>
      </div>

      <label className="text-sm block">
        <span className="block text-gray-400 mb-1">Importer dans</span>
        <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setAnalysis(null); }} className="border rounded-lg px-3 py-2 w-full sm:w-96">
          <option value="">Catalogue general (tous les produits)</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              Uniquement : {s.name}
            </option>
          ))}
        </select>
        <span className="block text-xs text-gray-500 mt-1">Avec un point de vente choisi, les produits lui sont rattaches (stock, categories) et les autres points de vente ne sont pas modifies.</span>
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition ${drag ? "border-[#f5b942] bg-[#f5b942]/5" : "border-white/20 hover:border-[#f5b942]/60"}`}
      >
        <p className="text-lg font-medium">Glissez vos fichiers ici</p>
        <p className="text-sm text-gray-500">ou cliquez pour les choisir (plusieurs a la fois)</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="border rounded-2xl bg-[#1c1514] p-4 space-y-3">
          <ul className="divide-y divide-white/5 text-sm">
            {files.map((f, i) => (
              <li key={i} className="py-1.5 flex items-center justify-between gap-3">
                <span className="truncate">{f.name}</span>
                <span className="text-gray-500 shrink-0">
                  {size(f.size)}{" "}
                  <button onClick={() => { setFiles(files.filter((_, j) => j !== i)); setAnalysis(null); }} className="text-red-400 ml-2" aria-label="Retirer">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={fromImages} onChange={(e) => { setFromImages(e.target.checked); setAnalysis(null); }} className="mt-1" />
            <span>
              Creer aussi un produit pour chaque photo qui n&apos;a pas de produit
              <span className="block text-xs text-gray-500">Le nom vient du nom du fichier ; le produit reste masque tant que vous n&apos;avez pas saisi son prix.</span>
            </span>
          </label>
          <button onClick={analyze} disabled={busy !== ""} className="bg-[#b3261e] text-white rounded-lg px-5 py-2.5 font-medium disabled:opacity-50">
            {busy === "analyze" ? "Analyse en cours..." : "Analyser les fichiers"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-400 border border-red-500/30 rounded-xl p-3">{error}</p>}

      {analysis && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Produits a creer", analysis.create],
              ["A mettre a jour", analysis.update],
              ["Photos associees", `${analysis.images_matched} / ${analysis.images_total}`],
              ["Photos sans produit", analysis.images_unmatched.length],
            ].map(([l, v]) => (
              <div key={l as string} className="border rounded-2xl bg-[#1c1514] p-4">
                <p className="text-sm text-gray-400">{l}</p>
                <p className="text-2xl font-bold mt-1">{v}</p>
              </div>
            ))}
          </div>

          <div className="text-sm text-gray-400">
            Documents lus : {analysis.documents.map((d) => `${d.name} (${d.kind})`).join(" · ") || "aucun"}
          </div>
          {analysis.warnings.length > 0 && (
            <ul className="text-sm text-amber-400 list-disc list-inside border border-amber-500/30 rounded-xl p-3">
              {analysis.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {analysis.images_unmatched.length > 0 && (
            <p className="text-sm text-amber-400">
              Photos non associees ({analysis.images_unmatched.length}) : {analysis.images_unmatched.slice(0, 12).join(", ")}
              {analysis.images_unmatched.length > 12 ? "..." : ""} — renommez-les comme le produit, ou cochez « Creer aussi un produit pour chaque photo ».
            </p>
          )}

          <div className="border rounded-2xl bg-[#1c1514] overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-400">
                <tr>
                  <th className="p-2">Action</th>
                  <th className="p-2">Produit</th>
                  <th className="p-2">Categorie</th>
                  <th className="p-2 text-right">Prix</th>
                  <th className="p-2 text-right">Stock</th>
                  <th className="p-2">Photo</th>
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((r, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-2">
                      <span className={`text-xs px-2 py-0.5 rounded-md ${r.action === "create" ? "bg-emerald-500/15 text-emerald-400" : "bg-sky-500/15 text-sky-400"}`}>
                        {r.action === "create" ? "Creer" : "Mettre a jour"}
                      </span>
                    </td>
                    <td className="p-2">
                      {r.name}
                      {r.warning && <div className="text-xs text-amber-400">{r.warning}</div>}
                    </td>
                    <td className="p-2 text-gray-400">{r.category || "-"}</td>
                    <td className="p-2 text-right">{r.price != null ? formatXof(r.price) : "-"}</td>
                    <td className="p-2 text-right text-gray-400">{r.stock ?? "-"}</td>
                    <td className="p-2 text-gray-400 max-w-[200px] truncate">
                      {r.image_index != null ? `✓ ${analysis.image_names[r.image_index]}` : r.image_url ? "✓ lien" : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analysis.total_rows > analysis.rows.length && (
              <p className="p-3 text-xs text-gray-500">Apercu des {analysis.rows.length} premieres lignes sur {analysis.total_rows}.</p>
            )}
          </div>

          {progress && (
            <div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#f5b942] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Photos rattachees : {progress.done} / {progress.total}
              </p>
            </div>
          )}
          <button onClick={runImport} disabled={busy !== "" || analysis.total_rows === 0} className="bg-emerald-600 text-white rounded-lg px-6 py-3 font-semibold disabled:opacity-50">
            {busy === "import" ? "Import en cours... ne fermez pas la page" : `Importer ${analysis.total_rows} produit(s) et ${analysis.images_matched} photo(s)`}
          </button>
        </div>
      )}

      {result && (
        <div className="border border-emerald-500/40 rounded-2xl bg-emerald-500/5 p-5 space-y-2">
          <p className="font-semibold text-emerald-400">Import termine</p>
          <p className="text-sm">
            {result.created} produit(s) cree(s) · {result.updated} mis a jour · {result.attached} photo(s) rattachee(s)
          </p>
          {result.errors.length > 0 && (
            <ul className="text-sm text-amber-400 list-disc list-inside">
              {result.errors.slice(0, 15).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <p className="text-sm text-gray-400">
            Retrouvez-les dans <Link href="/admin/products" className="text-[#f5b942] underline">Produits</Link> (les produits sans prix restent masques jusqu&apos;a ce que vous saisissiez le prix).
          </p>
        </div>
      )}
    </div>
  );
}
