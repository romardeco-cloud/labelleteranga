"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { CompanyBranding } from "@/lib/branding";
import { apiErrorMessage } from "@/lib/documents";

export default function BrandingPage() {
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<CompanyBranding>("/stores/company-branding/").then((r) => {
      setBranding(r.data);
      setName(r.data.name);
    });
  }, []);

  async function save(extra: Record<string, string> = {}) {
    setBusy(true);
    setMsg(null);
    try {
      const f = new FormData();
      f.append("name", name);
      if (logo) f.append("logo", logo);
      Object.entries(extra).forEach(([k, v]) => f.append(k, v));
      const res = await api.post<CompanyBranding>("/stores/company-branding/", f);
      setBranding(res.data);
      setName(res.data.name);
      setLogo(null);
      if (logoRef.current) logoRef.current.value = "";
      setMsg({ ok: true, text: "Enregistre. Le nom et le logo sont mis a jour sur le site, en caisse et dans l'administration." });
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err, "Enregistrement impossible.") });
    } finally {
      setBusy(false);
    }
  }

  if (!branding) return <p className="text-gray-500">Chargement...</p>;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Identite de l&apos;entreprise</h1>
        <p className="text-sm text-gray-500">Nom et logo affiches sur le site, en caisse, dans l&apos;administration et en en-tete des rapports et documents.</p>
      </div>

      <div className="border rounded-2xl bg-[#1c1514] p-4 space-y-3">
        <p className="font-medium">Logo</p>
        <div className="h-32 rounded-xl bg-white flex items-center justify-center overflow-hidden">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={URL.createObjectURL(logo)} alt="" className="max-h-full max-w-full object-contain" />
          ) : branding.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo} alt="Logo actuel" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-gray-400">Pas encore de logo</span>
          )}
        </div>
        <input ref={logoRef} type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} className="text-xs w-full" />
        {branding.logo && !logo && (
          <button onClick={() => save({ remove_logo: "true" })} disabled={busy} className="text-xs text-red-400 underline">
            Retirer le logo
          </button>
        )}
      </div>

      <label className="text-sm block">
        <span className="block text-gray-400 mb-1">Nom de l&apos;entreprise</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
      </label>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      <button onClick={() => save()} disabled={busy || !name.trim()} className="bg-[#b3261e] text-white rounded-lg px-6 py-2.5 font-medium disabled:opacity-50">
        {busy ? "Enregistrement..." : "Enregistrer"}
      </button>
    </div>
  );
}
