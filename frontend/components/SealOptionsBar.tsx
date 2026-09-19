"use client";

import { useCompanyContact } from "@/components/SealBlock";
import { useSealOpts } from "@/lib/sealOpts";

/** Cases a cocher : ajouter ou non la mention « Document certifie », le cachet et la signature sur ce document (ecran, impression et PDF). */
export default function SealOptionsBar({ className = "" }: { className?: string }) {
  const seal = useCompanyContact();
  const defaults = { mention: seal?.show_certified ?? true, stamp: seal?.show_stamp ?? true, signature: seal?.show_signature ?? true };
  const [opts, save] = useSealOpts(defaults);
  if (!seal || !seal.enabled) return null;
  const items: { key: keyof typeof opts; label: string; has: boolean }[] = [
    { key: "mention", label: seal.certified_text || "Document certifié", has: true },
    { key: "stamp", label: "Cachet", has: !!seal.stamp },
    { key: "signature", label: "Signature", has: !!seal.signature },
  ];
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm print:hidden ${className}`}>
      <span className="text-gray-500 text-xs">Ajouter sur ce document :</span>
      {items
        .filter((i) => i.has)
        .map((i) => (
          <label key={i.key} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={opts[i.key]} onChange={(e) => save({ ...opts, [i.key]: e.target.checked })} />
            {i.label}
          </label>
        ))}
    </div>
  );
}
