"use client";

import { useEffect, useState } from "react";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Date du jour (fuseau du Senegal) : « Lundi 22 septembre 2026 » et version courte « lun. 22 sept. » ; se met a jour toute seule a minuit. */
export function formatToday(d = new Date()) {
  const tz = { timeZone: "Africa/Dakar" } as const;
  return {
    key: d.toLocaleDateString("en-CA", tz), // 2026-09-22
    long: cap(d.toLocaleDateString("fr-FR", { ...tz, weekday: "long", day: "numeric", month: "long", year: "numeric" })),
    short: d.toLocaleDateString("fr-FR", { ...tz, weekday: "short", day: "numeric", month: "short" }),
  };
}

export function useToday() {
  const [today, setToday] = useState(() => formatToday());
  useEffect(() => {
    const t = setInterval(() => setToday((cur) => (formatToday().key !== cur.key ? formatToday() : cur)), 30000);
    return () => clearInterval(t);
  }, []);
  return today;
}
