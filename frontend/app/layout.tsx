import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const DESCRIPTION = "Restaurant & fast-food, supermarché, quincaillerie, dépôt d'aliments, ferme et service de forage : tous les services La Belle Teranga au Sénégal.";

export const metadata: Metadata = {
  metadataBase: new URL("https://labelleteranga.com"),
  title: "La Belle Teranga",
  description: DESCRIPTION,
  openGraph: {
    title: "La Belle Teranga",
    description: DESCRIPTION,
    siteName: "La Belle Teranga",
    type: "website",
    locale: "fr_SN",
    images: [{ url: "/logo.jpg", alt: "La Belle Teranga" }],
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.jpg",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "La Belle Teranga",
  },
};

export const viewport: Viewport = {
  themeColor: "#9c1c1c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
