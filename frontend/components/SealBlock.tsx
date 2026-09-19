"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Seal = {
  enabled: boolean;
  stamp: string | null;
  signature: string | null;
  signer_name: string;
  signer_title: string;
  place: string;
  certified_text: string;
  show_date: boolean;
  stamp_color?: string;
};

let cache: Seal | null = null;

export function todayFr() {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** « Certifie conforme », date du jour, cachet et signature de l'entreprise : affiches en bas des documents et rapports (ecran et impression). */
export default function SealBlock({ printOnly = false, fresh = false }: { printOnly?: boolean; fresh?: boolean }) {
  const [seal, setSeal] = useState<Seal | null>(fresh ? null : cache);

  useEffect(() => {
    if (cache && !fresh) return;
    api
      .get<Seal>("/stores/company-seal/")
      .then((r) => {
        cache = r.data;
        setSeal(r.data);
      })
      .catch(() => {});
  }, [fresh]);

  if (!seal || !seal.enabled) return null;
  const where = seal.place ? `Fait à ${seal.place}${seal.show_date ? ", le" : ""}` : seal.show_date ? "Le" : "";
  return (
    <div className={`mt-10 flex flex-wrap items-start justify-between gap-6 text-sm text-gray-800 break-inside-avoid ${printOnly ? "hidden print:flex" : ""}`}>
      <div>
        <p className="font-semibold">{seal.certified_text}</p>
        {(where || seal.show_date) && (
          <p>
            {where} {seal.show_date ? todayFr() : ""}
          </p>
        )}
      </div>
      <div className="flex flex-col items-center text-center w-72 max-w-full">
        {seal.signer_name && <strong className="text-[15px] text-gray-900">{seal.signer_name}</strong>}
        {seal.signer_title && <span className="text-gray-600 text-[13px]">{seal.signer_title}</span>}
        {(seal.stamp || seal.signature) && (
          <div className="mt-2 grid w-full place-items-center bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {seal.stamp && <img src={seal.stamp} alt="Cachet de l'entreprise" className="col-start-1 row-start-1 h-32 w-auto max-w-[62%] object-contain" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {seal.signature && <img src={seal.signature} alt="Signature" className={`col-start-1 row-start-1 object-contain ${seal.stamp ? "w-[70%] max-h-[70px] translate-y-3" : "w-[90%] max-h-24"}`} />}
          </div>
        )}
      </div>
    </div>
  );
}
