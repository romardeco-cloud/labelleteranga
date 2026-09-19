"use client";

import { RATING_LABELS } from "@/lib/engage";

const STAR = "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.3-6.2 3.3L7 14.2 2 9.3l6.9-1z";

function Star({ fill, size }: { fill: number; size: number }) {
  // fill : 0 a 1 (etoile partiellement remplie pour les moyennes)
  const id = `s${Math.round(fill * 100)}${size}`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="#f5b942" />
          <stop offset={`${fill * 100}%`} stopColor="#d1d5db" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${id})`} stroke="#e0a21f" strokeWidth={0.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Affichage d'une note sur 5 (accepte les moyennes : 4,3 => 4 etoiles + 30 %). */
export function StarsDisplay({ value, size = 16 }: { value: number | null | undefined; size?: number }) {
  const v = value ?? 0;
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={value == null ? "Pas de note" : `${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={Math.max(0, Math.min(1, v - (i - 1)))} />
      ))}
    </span>
  );
}

/** Saisie d'une note de 1 a 5 (1 = tres mauvais ... 5 = excellent). */
export function StarsInput({
  value,
  onChange,
  size = 34,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
  label?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} - ${RATING_LABELS[i]}`}
            onClick={() => onChange(i)}
            className="p-0.5 hover:scale-110 transition"
          >
            <Star size={size} fill={i <= value ? 1 : 0} />
          </button>
        ))}
        <span className={`ml-2 text-sm font-medium ${value ? "text-brand-dark" : "text-gray-400"}`}>{value ? `${value}/5 - ${RATING_LABELS[value]}` : "Touchez une etoile"}</span>
      </div>
    </div>
  );
}
