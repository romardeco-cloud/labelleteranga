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
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {seal.stamp && <img src={seal.stamp} alt="Cachet de l'entreprise" className="h-24 w-auto object-contain" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {seal.signature && <img src={seal.signature} alt="Signature" className="h-16 w-auto object-contain" />}
        </div>
        {(seal.signer_name || seal.signer_title) && (
          <p className="text-right mt-1">
            {seal.signer_name && <strong className="block">{seal.signer_name}</strong>}
            {seal.signer_title}
          </p>
        )}
      </div>
    </div>
  );
}
