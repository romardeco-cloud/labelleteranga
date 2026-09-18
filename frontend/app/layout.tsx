import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "La Belle Teranga | Supermarche en ligne",
  description: "Faites vos courses en ligne avec La Belle Teranga, livraison partout au Senegal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <footer className="border-t mt-16 py-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} La Belle Teranga — Labelleteranga.com
        </footer>
      </body>
    </html>
  );
}
