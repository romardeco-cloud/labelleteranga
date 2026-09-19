import type { ReactNode } from "react";

export type SocialKey = "whatsapp" | "phone" | "facebook" | "instagram" | "tiktok" | "x" | "youtube" | "telegram" | "website";
export type SocialLinksMap = Partial<Record<SocialKey, string>>;

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  whatsapp: "WhatsApp",
  phone: "Telephone",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X (Twitter)",
  youtube: "YouTube",
  telegram: "Telegram",
  website: "Site web",
};

const ICONS: Record<SocialKey, ReactNode> = {
  phone: (
    <path d="M6.6 10.8c1.3 2.6 3.4 4.7 6 6l2-2c.3-.3.7-.4 1-.2 1 .3 2.1.5 3.2.5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.8c.6 0 1 .4 1 1 0 1.1.2 2.2.5 3.2.1.4 0 .7-.2 1z" />
  ),
  whatsapp: (
    <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.2.2-.3.2-.5.1-1.4-.7-2.3-1.2-3.2-2.8-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.5-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-1 1-1 2.3 0 1.4 1 2.7 1.1 2.9.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.5-.3z" />
  ),
  facebook: <path d="M13.5 21v-7.5h2.5l.4-3H13.5V8.4c0-.9.2-1.5 1.5-1.5h1.6V4.3C16.3 4.2 15.3 4 14.2 4c-2.3 0-3.9 1.4-3.9 4v2.5H7.8v3h2.5V21h3.2z" />,
  instagram: (
    <path d="M12 2c2.7 0 3 0 4.1.1 1.1 0 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1.1.4 2.2.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c0 1.1-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.3-2.2.4-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-1.1 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1.1-.4-2.2C2 15 2 14.7 2 12s0-3 .1-4.1c0-1.1.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.3 2.2-.4C10 2 10.3 2 13 2zm-1 3.7a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6zm0 8.7a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8zm5.5-8.9a1.2 1.2 0 1 1 0-2.5 1.2 1.2 0 0 1 0 2.5z" />
  ),
  tiktok: <path d="M14 2h2.7c.2 1.6 1.3 2.9 3.3 3.1v2.8c-1.2 0-2.3-.4-3.3-1v6.5a5.6 5.6 0 1 1-4.9-5.6v2.9a2.7 2.7 0 1 0 2.2 2.7V2z" />,
  x: <path d="M18.9 3H22l-7 8 8 10h-6.3l-5-6.2L5.9 21H3l7.5-8.6L3 3h6.4l4.5 5.7L18.9 3zm-1.1 16h1.7L7.3 5H5.5l12.3 14z" />,
  youtube: (
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.7 2 12 2 12s0 3.3.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.5.4-4.8.4-4.8s0-3.3-.4-4.8zM10 15V9l5.2 3L10 15z" />
  ),
  telegram: (
    <path d="M21.9 4.3 18.6 19.6c-.2 1.1-.9 1.3-1.8.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6.1 13.1 1.2 11.6c-1.1-.3-1.1-1.1.2-1.6L20.5 2.6c.9-.3 1.7.2 1.4 1.7z" />
  ),
  website: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15.7 15.7 0 0 0-1.4-6A8 8 0 0 1 18.9 11zM12 4c.8 1 1.6 3 1.9 7h-3.8c.3-4 1.1-6 1.9-7zM4.1 13h3a15.7 15.7 0 0 0 1.4 6A8 8 0 0 1 4.1 13zm3-2h-3a8 8 0 0 1 4.4-6 15.7 15.7 0 0 0-1.4 6zM12 20c-.8-1-1.6-3-1.9-7h3.8c-.3 4-1.1 6-1.9 7zm2.5-1a15.7 15.7 0 0 0 1.4-6h3a8 8 0 0 1-4.4 6z" />,
};

const ENV: SocialLinksMap = {
  phone: process.env.NEXT_PUBLIC_PHONE || undefined,
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP || undefined,
  facebook: process.env.NEXT_PUBLIC_FACEBOOK || undefined,
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM || undefined,
  tiktok: process.env.NEXT_PUBLIC_TIKTOK || undefined,
  x: process.env.NEXT_PUBLIC_X || undefined,
};

const ORDER: SocialKey[] = ["whatsapp", "phone", "facebook", "instagram", "tiktok", "youtube", "x", "telegram", "website"];

const digits = (v: string) => v.replace(/\D/g, "");

/** Transforme ce que saisit le gerant (numero, @pseudo ou lien) en lien cliquable. */
export function socialHref(key: SocialKey, raw?: string | null): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (key === "phone") return `tel:${v.replace(/\s+/g, "")}`;
  if (key === "whatsapp") {
    if (/^https?:\/\//i.test(v)) return v;
    const d = digits(v);
    return d ? `https://wa.me/${d.length === 9 ? `221${d}` : d}` : null;
  }
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  switch (key) {
    case "facebook":
      return `https://facebook.com/${handle}`;
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "tiktok":
      return `https://tiktok.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    case "youtube":
      return `https://youtube.com/@${handle}`;
    case "telegram":
      return `https://t.me/${handle}`;
    default:
      return `https://${v}`;
  }
}

export function SocialIcon({ name, size = 20 }: { name: SocialKey; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** Icones des reseaux sociaux. `links` = comptes du point de vente (Parametres) ; a defaut, valeurs par defaut du site. */
export default function SocialLinks({ links }: { links?: SocialLinksMap | null }) {
  const merged = { ...ENV, ...(links ?? {}) };
  const active = ORDER.map((key) => ({ key, href: socialHref(key, merged[key]) })).filter((l) => l.href);
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 py-2">
      {active.map((l) => (
        <a
          key={l.key}
          href={l.href!}
          target={l.key === "phone" ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label={SOCIAL_LABELS[l.key]}
          title={SOCIAL_LABELS[l.key]}
          className="text-brand hover:text-brand-dark transition"
        >
          <SocialIcon name={l.key} />
        </a>
      ))}
    </div>
  );
}
