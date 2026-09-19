"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR code genere dans le navigateur (aucun service externe). */
export function useQrDataUrl(url: string, width = 640) {
  const [dataUrl, setDataUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width, margin: 2, errorCorrectionLevel: "M", color: { dark: "#6e1212", light: "#ffffff" } })
      .then((d) => !cancelled && setDataUrl(d))
      .catch(() => !cancelled && setDataUrl(""));
    return () => {
      cancelled = true;
    };
  }, [url, width]);
  return dataUrl;
}

export default function QrCode({ url, size = 220, className = "" }: { url: string; size?: number; className?: string }) {
  const dataUrl = useQrDataUrl(url);
  if (!dataUrl) return <div style={{ width: size, height: size }} className={`bg-gray-100 animate-pulse rounded-lg ${className}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt={`QR code ${url}`} width={size} height={size} className={`rounded-lg ${className}`} />;
}
