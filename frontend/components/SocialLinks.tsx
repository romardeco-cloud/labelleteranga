const LINKS = [
  {
    key: "phone",
    href: process.env.NEXT_PUBLIC_PHONE ? `tel:${process.env.NEXT_PUBLIC_PHONE}` : null,
    label: "Telephone",
    icon: (
      <path d="M6.6 10.8c1.3 2.6 3.4 4.7 6 6l2-2c.3-.3.7-.4 1-.2 1 .3 2.1.5 3.2.5.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.8c.6 0 1 .4 1 1 0 1.1.2 2.2.5 3.2.1.4 0 .7-.2 1z" />
    ),
  },
  {
    key: "whatsapp",
    href: process.env.NEXT_PUBLIC_WHATSAPP ? `https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP}` : null,
    label: "WhatsApp",
    icon: (
      <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.7.8-.8 1-.2.2-.3.2-.5.1-1.4-.7-2.3-1.2-3.2-2.8-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.5-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-1 1-1 2.3 0 1.4 1 2.7 1.1 2.9.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.5-.3z" />
    ),
  },
  {
    key: "facebook",
    href: process.env.NEXT_PUBLIC_FACEBOOK || null,
    label: "Facebook",
    icon: (
      <path d="M13.5 21v-7.5h2.5l.4-3H13.5V8.4c0-.9.2-1.5 1.5-1.5h1.6V4.3C16.3 4.2 15.3 4 14.2 4c-2.3 0-3.9 1.4-3.9 4v2.5H7.8v3h2.5V21h3.2z" />
    ),
  },
  {
    key: "instagram",
    href: process.env.NEXT_PUBLIC_INSTAGRAM || null,
    label: "Instagram",
    icon: (
      <path d="M12 2c2.7 0 3 0 4.1.1 1.1 0 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1.1.4 2.2.1 1.1.1 1.4.1 4.1s0 3-.1 4.1c0 1.1-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.3-2.2.4-1.1.1-1.4.1-4.1.1s-3 0-4.1-.1c-1.1 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1.1-.4-2.2C2 15 2 14.7 2 12s0-3 .1-4.1c0-1.1.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.3 2.2-.4C10 2 10.3 2 13 2zm-1 3.7a5.3 5.3 0 1 0 0 10.6 5.3 5.3 0 0 0 0-10.6zm0 8.7a3.4 3.4 0 1 1 0-6.8 3.4 3.4 0 0 1 0 6.8zm5.5-8.9a1.2 1.2 0 1 1 0-2.5 1.2 1.2 0 0 1 0 2.5z" />
    ),
  },
  {
    key: "tiktok",
    href: process.env.NEXT_PUBLIC_TIKTOK || null,
    label: "TikTok",
    icon: (
      <path d="M14 2h2.7c.2 1.6 1.3 2.9 3.3 3.1v2.8c-1.2 0-2.3-.4-3.3-1v6.5a5.6 5.6 0 1 1-4.9-5.6v2.9a2.7 2.7 0 1 0 2.2 2.7V2z" />
    ),
  },
  {
    key: "x",
    href: process.env.NEXT_PUBLIC_X || null,
    label: "X",
    icon: (
      <path d="M18.9 3H22l-7 8 8 10h-6.3l-5-6.2L5.9 21H3l7.5-8.6L3 3h6.4l4.5 5.7L18.9 3zm-1.1 16h1.7L7.3 5H5.5l12.3 14z" />
    ),
  },
];

export default function SocialLinks() {
  const active = LINKS.filter((l) => l.href);
  if (active.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-4 py-2">
      {active.map((l) => (
        <a
          key={l.key}
          href={l.href!}
          target={l.key === "phone" ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label={l.label}
          className="text-brand hover:text-brand-dark transition"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            {l.icon}
          </svg>
        </a>
      ))}
    </div>
  );
}
