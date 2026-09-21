"use client";

import { useEffect, useState } from "react";
import InstallApp from "@/components/site/InstallApp";
import { useSite } from "@/components/site/SiteContext";
import { shortName } from "@/lib/site";

/** Invite a installer l'application : sur telephone, ou des que le client arrive via le QR code (?install=1). */
export default function InstallBanner() {
  const { site } = useSite();
  const [show, setShow] = useState(false);
  const key = `lbt_install_dismissed_${site.slug}`;

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const fromQr = new URLSearchParams(window.location.search).get("install") === "1";
    const mobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) === "1" && !fromQr;
    } catch {}
    setShow((fromQr || mobile) && !dismissed);
  }, [key]);

  if (!show) return null;
  return (
    <div className="bg-brand-light border-b border-brand-accent/40 pl-4 pr-2 py-1.5 flex items-center justify-between gap-2 text-sm">
      <span className="text-brand-dark font-medium truncate">Installer {shortName(site.name)} sur mon telephone</span>
      <div className="flex items-center gap-1 shrink-0">
        <InstallApp appName={shortName(site.name)} className="bg-brand text-white rounded-full px-3.5 py-1.5 text-xs font-semibold" />
        <button
          aria-label="Fermer"
          onClick={() => {
            setShow(false);
            try {
              localStorage.setItem(key, "1");
            } catch {}
          }}
          className="w-8 h-8 rounded-full text-gray-500 hover:bg-black/5 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
