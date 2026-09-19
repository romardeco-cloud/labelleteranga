"use client";

import { useEffect, useRef, useState } from "react";
import SealBlock, { Seal } from "@/components/SealBlock";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/documents";

export default function SealPage() {
  const [seal, setSeal] = useState<Seal | null>(null);
  const [stamp, setStamp] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [keepBg, setKeepBg] = useState(false);
  const [stampColor, setStampColor] = useState("original");
  const [signColor, setSignColor] = useState("blue");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stampRef = useRef<HTMLInputElement>(null);
  const signRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Seal>("/stores/company-seal/").then((r) => {
      setSeal(r.data);
      if (r.data.stamp_color) setStampColor(r.data.stamp_color);
    });
  }, []);

  async function save(extra: Record<string, string> = {}) {
    if (!seal) return;
    setBusy(true);
    setMsg(null);
    try {
      const f = new FormData();
      f.append("enabled", String(seal.enabled));
      f.append("show_date", String(seal.show_date));
      f.append("signer_name", seal.signer_name);
      f.append("signer_title", seal.signer_title);
      f.append("legal_line", seal.legal_line ?? "");
      f.append("contact_address", seal.contact_address ?? "");
      f.append("contact_phone", seal.contact_phone ?? "");
      f.append("contact_whatsapp", seal.contact_whatsapp ?? "");
      f.append("contact_email", seal.contact_email ?? "");
      f.append("contact_website", seal.contact_website ?? "");
      f.append("contact_extra", seal.contact_extra ?? "");
      f.append("place", seal.place);
      f.append("certified_text", seal.certified_text);
      f.append("keep_background", String(keepBg));
      f.append("stamp_color", stampColor);
      f.append("signature_color", signColor);
      if (stamp) f.append("stamp", stamp);
      if (signature) f.append("signature", signature);
      Object.entries(extra).forEach(([k, v]) => f.append(k, v));
      const res = await api.post<Seal>("/stores/company-seal/", f);
      setSeal(res.data);
      setStamp(null);
      setSignature(null);
      if (stampRef.current) stampRef.current.value = "";
      if (signRef.current) signRef.current.value = "";
      setVersion((v) => v + 1);
      setMsg({ ok: true, text: "Enregistre. Le cachet et la signature apparaissent en bas de tous les documents et rapports." });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Enregistrement impossible.") });
    } finally {
      setBusy(false);
    }
  }

  if (!seal) return <p className="text-gray-500">Chargement...</p>;
  const set = <K extends keyof Seal>(k: K, v: Seal[K]) => setSeal({ ...seal, [k]: v });

  const slots = [
    { label: "Cachet de l'entreprise", current: seal.stamp, picked: stamp, setPicked: setStamp, ref: stampRef, removeKey: "remove_stamp" },
    { label: "Signature", current: seal.signature, picked: signature, setPicked: setSignature, ref: signRef, removeKey: "remove_signature" },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Cachet et signature</h1>
        <p className="text-sm text-gray-500">
          Ajoutes automatiquement en bas, a la fin de tous les documents (devis, factures, bons de commande) et rapports (ventes, clotures, inventaires), avec la mention
          « Certifie conforme » et la date du jour.
        </p>
      </div>

      <label className="flex items-center gap-3 border rounded-2xl bg-[#1c1514] p-4">
        <input type="checkbox" checked={seal.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        <span>
          <strong>Ajouter automatiquement sur les documents et rapports</strong>
          <span className="block text-xs text-gray-500">Desactivez pour retirer la mention, le cachet et la signature de toutes les impressions.</span>
        </span>
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        {slots.map((s) => (
          <div key={s.label} className="border rounded-2xl bg-[#1c1514] p-4 space-y-3">
            <p className="font-medium">{s.label}</p>
            <div className="h-32 rounded-xl bg-white flex items-center justify-center overflow-hidden">
              {s.picked ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={URL.createObjectURL(s.picked)} alt="" className="max-h-full max-w-full object-contain" />
              ) : s.current ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.current} alt={s.label} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs text-gray-400">Pas encore de photo</span>
              )}
            </div>
            <input ref={s.ref} type="file" accept="image/*" onChange={(e) => s.setPicked(e.target.files?.[0] ?? null)} className="text-xs w-full" />
            <label className="block text-xs text-gray-400">
              Couleur de l&apos;encre
              <select
                value={s.removeKey === "remove_stamp" ? stampColor : signColor}
                onChange={(e) => (s.removeKey === "remove_stamp" ? setStampColor(e.target.value) : setSignColor(e.target.value))}
                className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
              >
                {s.removeKey === "remove_stamp" && <option value="original">Couleurs d&apos;origine du cachet (recommande)</option>}
                {s.removeKey === "remove_stamp" && <option value="burgundy">Bordeaux (encre, une couleur)</option>}
                {s.removeKey === "remove_stamp" && <option value="forest">Vert foret (encre, une couleur)</option>}
                <option value="blue">{s.removeKey === "remove_stamp" ? "Bleu encre (une couleur)" : "Bleu encre (recommande)"}</option>
                <option value="navy">Bleu marine</option>
                <option value="black">Noir</option>
                {s.removeKey !== "remove_stamp" && <option value="original">Couleur d&apos;origine de la photo</option>}
              </select>
            </label>
            {s.current && !s.picked && (
              <button onClick={() => save({ [s.removeKey]: "true" })} disabled={busy} className="text-xs text-red-400 underline">
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={keepBg} onChange={(e) => setKeepBg(e.target.checked)} className="mt-1" />
        <span>
          Garder le fond de la photo
          <span className="block text-xs text-gray-500">Par defaut, le fond blanc ou papier est retire automatiquement pour que le cachet et la signature se posent comme un vrai tampon.</span>
        </span>
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm block">
          <span className="block text-gray-400 mb-1">Nom du signataire</span>
          <input value={seal.signer_name} onChange={(e) => set("signer_name", e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm block">
          <span className="block text-gray-400 mb-1">Fonction</span>
          <input value={seal.signer_title} onChange={(e) => set("signer_title", e.target.value)} placeholder="Ex. Gerant" className="w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm block">
          <span className="block text-gray-400 mb-1">Ville (Fait a ...)</span>
          <input value={seal.place} onChange={(e) => set("place", e.target.value)} placeholder="Ex. Ziguinchor" className="w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="text-sm block">
          <span className="block text-gray-400 mb-1">Mention</span>
          <input value={seal.certified_text} onChange={(e) => set("certified_text", e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </label>
      </div>
      <div className="border rounded-2xl bg-[#1c1514] p-4 space-y-3">
        <div>
          <p className="font-medium">En-tete et pied de page des documents</p>
          <p className="text-xs text-gray-500">Ces informations sont affichees dans l&apos;en-tete (a cote du logo) et en bas de chaque page des PDF. Modifiez-les ou ajoutez-en quand vous voulez ; un champ vide n&apos;est pas affiche.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm block sm:col-span-2">
            <span className="block text-gray-400 mb-1">Adresse</span>
            <input value={seal.contact_address ?? ""} onChange={(e) => set("contact_address", e.target.value)} placeholder="Ex. Quartier ..., Ziguinchor, Senegal" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm block">
            <span className="block text-gray-400 mb-1">Telephone</span>
            <input value={seal.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} placeholder="Ex. +221 77 000 00 00" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm block">
            <span className="block text-gray-400 mb-1">WhatsApp</span>
            <input value={seal.contact_whatsapp ?? ""} onChange={(e) => set("contact_whatsapp", e.target.value)} placeholder="Ex. +221 78 000 00 00" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm block">
            <span className="block text-gray-400 mb-1">Courriel</span>
            <input value={seal.contact_email ?? ""} onChange={(e) => set("contact_email", e.target.value)} placeholder="info@labelleteranga.com" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm block">
            <span className="block text-gray-400 mb-1">Site web</span>
            <input value={seal.contact_website ?? ""} onChange={(e) => set("contact_website", e.target.value)} placeholder="labelleteranga.com" className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm block sm:col-span-2">
            <span className="block text-gray-400 mb-1">Identifiants legaux (RCCM, NINEA)</span>
            <input value={seal.legal_line ?? ""} onChange={(e) => set("legal_line", e.target.value)} placeholder="RCCM ... · NINEA ..." className="w-full border rounded-lg px-3 py-2" />
          </label>
          <label className="text-sm block sm:col-span-2">
            <span className="block text-gray-400 mb-1">Lignes supplementaires (une information par ligne : 2e telephone, compte bancaire, horaires...)</span>
            <textarea value={seal.contact_extra ?? ""} onChange={(e) => set("contact_extra", e.target.value)} rows={3} maxLength={500} className="w-full border rounded-lg px-3 py-2" />
          </label>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={seal.show_date} onChange={(e) => set("show_date", e.target.checked)} /> Afficher la date du jour (mise a jour automatiquement a chaque impression)
      </label>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      <button onClick={() => save()} disabled={busy} className="bg-[#b3261e] text-white rounded-lg px-6 py-2.5 font-medium disabled:opacity-50">
        {busy ? "Enregistrement..." : "Enregistrer"}
      </button>

      <div>
        <p className="text-sm text-gray-400 mb-2">Apercu en bas d&apos;un document :</p>
        <div className="bg-white rounded-xl p-4 min-h-[8rem]">
          <SealBlock key={version} fresh />
        </div>
      </div>
    </div>
  );
}
