"use client";

import { useEffect, useRef, useState } from "react";
import { CachesProduit } from "@/components/PhotoPrix";
import { PriceZone, Product, updateProduct } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

type Rect = { x: number; y: number; w: number; h: number };

/** Couleur dominante des pixels de la zone (fond a recouvrir) et couleur de texte lisible dessus. */
function couleursZone(img: HTMLImageElement, r: Rect): { bg: string; fg: string } | null {
  try {
    const c = document.createElement("canvas");
    const W = img.naturalWidth, H = img.naturalHeight;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(Math.floor(r.x * W), Math.floor(r.y * H), Math.max(1, Math.floor(r.w * W)), Math.max(1, Math.floor(r.h * H))).data;
    const comptes = new Map<string, number>();
    for (let i = 0; i < d.length; i += 4 * 3) {
      const k = [d[i], d[i + 1], d[i + 2]].map((v) => Math.round(v / 24) * 24).join(",");
      comptes.set(k, (comptes.get(k) ?? 0) + 1);
    }
    const [rgb] = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0];
    const [R, G, B] = rgb.split(",").map((v) => Math.min(255, Number(v)));
    const hex = "#" + [R, G, B].map((v) => v.toString(16).padStart(2, "0")).join("");
    const lum = 0.299 * R + 0.587 * G + 0.114 * B;
    return { bg: hex, fg: lum > 150 ? "#14213d" : "#ffffff" };
  } catch {
    return null; // photo non lisible par le navigateur (autre serveur) : couleurs a choisir a la main
  }
}

/**
 * Admin > Produits : definir, une fois par photo, la zone ou un prix est deja ecrit. Le site recouvre ensuite
 * cette zone avec le prix actuel partout (boutique, fiche produit, affiche, image telechargee).
 */
export default function ZonePrixEditor({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (p: Product) => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null);
  const [zone, setZone] = useState<PriceZone | null>(product.price_zone ?? null);
  const [trace, setTrace] = useState<{ x0: number; y0: number; r: Rect } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [lecture, setLecture] = useState<HTMLImageElement | null>(null);
  const [cible, setCible] = useState<"prix" | "poids">("prix");

  // copie de la photo lisible par le canvas (pour proposer automatiquement les couleurs du fond)
  useEffect(() => {
    if (!product.image) return;
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setLecture(i);
    i.src = product.image;
  }, [product.image]);

  function pos(e: React.PointerEvent) {
    const b = boite.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  }

  function fin() {
    if (!trace) return;
    const r = trace.r;
    setTrace(null);
    if (r.w < 0.02 || r.h < 0.02) return; // simple clic
    const c = (lecture && couleursZone(lecture, r)) || { bg: "#ffffff", fg: "#14213d" };
    if (cible === "poids") {
      if (!zone) {
        setMsg("Tracez d'abord le cadre du prix.");
        setCible("prix");
        return;
      }
      setZone({ ...zone, poids: { ...r, ...c } });
    } else {
      setZone({ ...(zone ?? { contenu: "prix" as const }), ...r, ...c });
    }
    setMsg("");
  }

  async function enregistrer(z: PriceZone | null) {
    setBusy(true);
    setMsg("");
    try {
      const p = await updateProduct(product.id, { price_zone: z });
      onSaved(p);
      onClose();
    } catch (err) {
      setMsg(apiErrorMessage(err, "Zone non enregistree."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 w-full max-w-3xl max-h-[95vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-lg">Prix écrit sur la photo : {product.name}</h2>
        <p className="text-sm text-gray-600">
          Tracez un cadre autour du prix déjà écrit sur la photo (cliquez-glissez). Le site le recouvrira toujours avec le prix actuel du
          produit, partout où la photo s&apos;affiche.
        </p>

        <div className="flex justify-center bg-gray-50 rounded-lg p-2">
          <div
            ref={boite}
            className="relative inline-block cursor-crosshair select-none touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = pos(e);
              setTrace({ x0: p.x, y0: p.y, r: { x: p.x, y: p.y, w: 0, h: 0 } });
            }}
            onPointerMove={(e) => {
              if (!trace) return;
              const p = pos(e);
              setTrace({ ...trace, r: { x: Math.min(trace.x0, p.x), y: Math.min(trace.y0, p.y), w: Math.abs(p.x - trace.x0), h: Math.abs(p.y - trace.y0) } });
            }}
            onPointerUp={fin}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={product.image ?? ""}
              alt={product.name}
              draggable={false}
              onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="block max-h-[55vh] w-auto"
            />
            {zone && !trace && dim && <CachesProduit product={product} zone={zone} largeur={dim.w} hauteur={dim.h} />}
            {[trace?.r ?? (cible === "prix" ? zone : zone?.poids)].filter(Boolean).map((r, i) => (
              <div
                key={i}
                className="absolute border-2 border-dashed border-red-500 pointer-events-none"
                style={{ left: `${r!.x * 100}%`, top: `${r!.y * 100}%`, width: `${r!.w * 100}%`, height: `${r!.h * 100}%` }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Cadre à tracer :</span>
          {(
            [
              ["prix", "Prix (obligatoire)"],
              ["poids", "Poids, s'il est écrit à part (facultatif)"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setCible(k)} className={`border rounded-lg px-3 py-1 ${cible === k ? "bg-brand text-white border-brand" : ""}`}>
              {l}
            </button>
          ))}
          {zone?.poids && (
            <button onClick={() => setZone({ ...zone, poids: undefined })} className="text-xs text-red-600 underline">
              Retirer le cadre du poids
            </button>
          )}
        </div>
        {zone?.poids && !product.unit?.trim() && (
          <p className="text-xs text-amber-600">Remplissez le champ « Poids / format » du produit : sans lui, le poids écrit sur la photo reste tel quel.</p>
        )}

        {zone && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              Fond
              <input type="color" value={zone.bg} onChange={(e) => setZone({ ...zone, bg: e.target.value })} />
            </label>
            <label className="flex items-center gap-2">
              Texte
              <input type="color" value={zone.fg} onChange={(e) => setZone({ ...zone, fg: e.target.value })} />
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={zone.contenu === "prix"} onChange={() => setZone({ ...zone, contenu: "prix" })} /> Prix seul
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={zone.contenu === "poids_prix"} onChange={() => setZone({ ...zone, contenu: "poids_prix" })} /> Poids + prix
            </label>
            {zone.contenu === "poids_prix" && !product.unit?.trim() && (
              <span className="text-xs text-amber-600">Remplissez le champ « Poids / format » du produit pour l&apos;afficher.</span>
            )}
          </div>
        )}
        {msg && <p className="text-sm text-red-600">{msg}</p>}

        <div className="flex flex-wrap gap-2 justify-end">
          {product.price_zone && (
            <button disabled={busy} onClick={() => enregistrer(null)} className="border border-red-500 text-red-600 rounded-lg px-4 py-2 text-sm">
              Retirer la zone
            </button>
          )}
          <button onClick={onClose} className="border rounded-lg px-4 py-2 text-sm">
            Annuler
          </button>
          <button disabled={busy || !zone} onClick={() => enregistrer(zone)} className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40">
            {busy ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
