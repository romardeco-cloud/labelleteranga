import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import SocialLinks from "@/components/SocialLinks";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "La Belle Teranga | Supermarche en ligne",
  description: "Faites vos courses en ligne avec La Belle Teranga, livraison partout au Senegal.",
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
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <footer className="border-t-2 border-brand-accent/40 mt-16 py-8 text-center text-sm text-gray-500 space-y-1 bg-brand-light">
          <p className="text-brand-dark font-medium italic">L&apos;art du service</p>
          <p>© {new Date().getFullYear()} La Belle Teranga — Labelleteranga.com</p>
          <p>
            Contact :{" "}
            <a href="mailto:info@labelleteranga.com" className="text-brand hover:underline">
              info@labelleteranga.com
            </a>
          </p>
          <SocialLinks />
        </footer>
      </body>
    </html>
  );
}
