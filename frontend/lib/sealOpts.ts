"use client";

import { useEffect, useState } from "react";

/** Choix, a chaque impression, de la mention « Document certifie », du cachet et de la signature (memorise sur cet appareil). */
export type SealOpts = { mention: boolean; stamp: boolean; signature: boolean };

const KEY = "seal_opts";
const EVENT = "seal-opts";

export function loadSealOpts(): SealOpts | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { mention: true, stamp: true, signature: true, ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function saveSealOpts(o: SealOpts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Valeur du parametre ?seal= des PDF (undefined = reglages par defaut de l'entreprise). */
export function sealParam(): string | undefined {
  const o = loadSealOpts();
  if (!o) return undefined;
  const on = (["mention", "stamp", "signature"] as const).filter((k) => o[k]);
  return on.length ? on.join(",") : "none";
}

export function useSealOpts(defaults: SealOpts): [SealOpts, (o: SealOpts) => void] {
  const [opts, setOpts] = useState<SealOpts>(defaults);
  useEffect(() => {
    const sync = () => setOpts(loadSealOpts() ?? defaults);
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults.mention, defaults.stamp, defaults.signature]);
  return [opts, saveSealOpts];
}
