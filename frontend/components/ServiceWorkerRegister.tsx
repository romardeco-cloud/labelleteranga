"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // installation impossible (navigateur non compatible, hors HTTPS...) - sans consequence
      });
    }
  }, []);

  return null;
}
