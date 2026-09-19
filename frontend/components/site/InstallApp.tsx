"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

type Platform = {
  os: "ios" | "android" | "mac" | "windows" | "other";
  browser: "safari" | "chrome" | "edge" | "firefox" | "samsung" | "opera" | "other";
  mobile: boolean;
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  const android = /android/i.test(ua);
  const os: Platform["os"] = ios ? "ios" : android ? "android" : /Macintosh/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "other";
  let browser: Platform["browser"] = "other";
  if (/SamsungBrowser/i.test(ua)) browser = "samsung";
  else if (/EdgA|EdgiOS|Edg\//.test(ua)) browser = "edge";
  else if (/OPR\/|OPiOS|Opera/i.test(ua)) browser = "opera";
  else if (/FxiOS|Firefox/i.test(ua)) browser = "firefox";
  else if (/CriOS|Chrome/i.test(ua)) browser = "chrome";
  else if (/Safari/i.test(ua)) browser = "safari";
  return { os, browser, mobile: ios || android };
}

/** Etapes d'installation adaptees a l'appareil et au navigateur du client. */
function steps(p: Platform): { title: string; items: string[]; note?: string } {
  if (p.os === "ios") {
    if (p.browser === "safari")
      return {
        title: "Sur iPhone / iPad (Safari)",
        items: ["Touchez le bouton Partager (carre avec une fleche vers le haut) en bas de l'ecran.", "Faites defiler et choisissez « Sur l'ecran d'accueil ».", "Touchez Ajouter."],
      };
    return {
      title: "Sur iPhone / iPad",
      items: ["Touchez le bouton Partager (ou le menu ⋯) de votre navigateur.", "Choisissez « Sur l'ecran d'accueil », puis Ajouter."],
      note: "Si l'option n'apparait pas, ouvrez ce lien dans Safari (copiez-le avec le bouton ci-dessous).",
    };
  }
  if (p.os === "android") {
    if (p.browser === "firefox")
      return { title: "Sur Android (Firefox)", items: ["Touchez le menu ⋮.", "Choisissez « Installer », puis confirmez."] };
    if (p.browser === "samsung")
      return { title: "Sur Android (Samsung Internet)", items: ["Touchez le menu ☰.", "Choisissez « Ajouter la page a » puis « Ecran d'accueil » (ou « Installer »)."] };
    return {
      title: "Sur Android",
      items: ["Touchez le menu ⋮ de votre navigateur.", "Choisissez « Installer l'application » (ou « Ajouter a l'ecran d'accueil »).", "Confirmez : l'icone apparait sur votre ecran d'accueil."],
    };
  }
  if (p.browser === "edge")
    return { title: "Sur ordinateur (Microsoft Edge)", items: ["Cliquez sur le menu ⋯ en haut a droite.", "Choisissez « Applications », puis « Installer ce site en tant qu'application ».", "Cliquez sur Installer."] };
  if (p.browser === "chrome" || p.browser === "opera")
    return {
      title: "Sur ordinateur (Chrome)",
      items: ["Cliquez sur l'icone d'installation a droite de la barre d'adresse (ecran avec une fleche).", "Ou menu ⋮ > « Caster, enregistrer et partager » > « Installer La Belle Teranga ».", "Cliquez sur Installer."],
    };
  if (p.os === "mac" && p.browser === "safari")
    return { title: "Sur Mac (Safari)", items: ["Menu Fichier > « Ajouter au Dock ».", "Cliquez sur Ajouter."], note: "Necessite macOS Sonoma ou plus recent." };
  if (p.browser === "firefox")
    return {
      title: "Firefox sur ordinateur",
      items: ["Firefox ne permet pas d'installer une application sur ordinateur."],
      note: "Ouvrez ce lien dans Google Chrome ou Microsoft Edge (copiez-le avec le bouton ci-dessous), ou ajoutez le site a vos favoris.",
    };
  return { title: "Installer l'application", items: ["Ouvrez le menu de votre navigateur.", "Choisissez « Installer l'application » ou « Ajouter a l'ecran d'accueil »."], note: "Sinon, ouvrez ce lien dans Chrome ou Edge." };
}

/** Bouton "Installer l'application" : invite native quand le navigateur la propose, sinon mode d'emploi adapte. */
export default function InstallApp({ appName, className = "" }: { appName: string; className?: string }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
    );
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    } else {
      setHelp(true);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copiez ce lien :", window.location.origin + window.location.pathname);
    }
  }

  const guide = platform ? steps(platform) : null;

  return (
    <>
      <button onClick={install} className={`inline-flex items-center gap-1.5 ${className}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12 M7 10l5 5 5-5 M5 21h14" />
        </svg>
        Installer l&apos;application
      </button>
      {help && guide && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setHelp(false)}>
          <div className="bg-white text-gray-800 rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-brand-dark">Installer {appName}</h2>
            <p className="text-sm text-gray-500 mb-3">{guide.title}</p>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              {guide.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ol>
            {guide.note && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mt-3">{guide.note}</p>}
            <p className="text-xs text-gray-500 mt-3">
              L&apos;application apparait ensuite comme les autres, sur l&apos;ecran d&apos;accueil du telephone ou dans le menu de l&apos;ordinateur, et
              permet de commander comme sur le site.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={copyLink} className="flex-1 border rounded-lg py-2.5 text-sm">
                {copied ? "Lien copie !" : "Copier le lien"}
              </button>
              <button onClick={() => setHelp(false)} className="flex-1 bg-brand text-white rounded-lg py-2.5 font-medium">
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
