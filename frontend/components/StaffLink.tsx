"use client";

import { useEffect, useState } from "react";
import { isStaffFlagged } from "@/lib/auth";

/** Lien « Espace pro » : visible uniquement pour un administrateur connecte, jamais pour les clients. */
export default function StaffLink() {
  const [visible, setVisible] = useState(false);
  const [href, setHref] = useState("/admin");

  useEffect(() => {
    setVisible(isStaffFlagged());
    if (/(^|\.)labelleteranga\.com$/i.test(window.location.hostname)) setHref("https://admin.labelleteranga.com");
  }, []);

  if (!visible) return null;
  return (
    <a href={href} className="opacity-80 hover:opacity-100 hover:text-brand-accent transition">
      Espace pro
    </a>
  );
}
