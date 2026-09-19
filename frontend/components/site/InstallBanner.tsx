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
    <div className="bg-brand-light border-b border-brand-accent/40 px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap text-sm">
      <span className="text-brand-dark font-medium">Installez l&apos;application {shortName(site.name)} sur votre telephone</span>
      <InstallApp appName={shortName(site.name)} className="bg-brand text-white rounded-full px-4 py-1.5 text-xs font-medium" />
      <button
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem(key, "1");
          } catch {}
        }}
        className="text-gray-500 text-xs underline"
      >
        Plus tard
      </button>
    </div>
  );
}
