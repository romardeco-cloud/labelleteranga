"use client";

import { useEffect, useState } from "react";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fuseau de reference pour tout affichage de date/heure : celui du Senegal, jamais celui de l'appareil qui regarde. */
export const SENEGAL_TZ = { timeZone: "Africa/Dakar" } as const;

/** Heure au Senegal, format HH:MM - independant du fuseau de l'appareil (navigateur/OS) qui l'affiche. */
export function formatDakarTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString("fr-FR", { ...SENEGAL_TZ, hour: "2-digit", minute: "2-digit" });
}

/** Date + heure au Senegal - independant du fuseau de l'appareil qui l'affiche. */
export function formatDakarDateTime(iso: string | Date, locale = "fr-FR") {
  return new Date(iso).toLocaleString(locale, SENEGAL_TZ);
}

/** Date seule au Senegal (jour/mois/annee, ou options personnalisees) - independant du fuseau de l'appareil qui l'affiche. */
export function formatDakarDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleDateString("fr-FR", { ...SENEGAL_TZ, ...opts });
}

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
