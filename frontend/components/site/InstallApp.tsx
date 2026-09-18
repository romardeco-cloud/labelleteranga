"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Bouton "Installer l'application" : invite native (Android/PC) ou mode d'emploi (iPhone/iPad). */
export default function InstallApp({ appName, className = "" }: { appName: string; className?: string }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIos(/iphone|ipad|ipod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document));
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

  return (
    <>
      <button onClick={install} className={`inline-flex items-center gap-1.5 ${className}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12 M7 10l5 5 5-5 M5 21h14" />
        </svg>
        Installer l&apos;application
      </button>
      {help && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setHelp(false)}>
          <div className="bg-white text-gray-800 rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold text-lg text-brand-dark mb-2">Installer {appName}</h2>
            {isIos ? (
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>
                  Ouvrez ce site dans <strong>Safari</strong>.
                </li>
                <li>
                  Touchez le bouton <strong>Partager</strong> (carre avec une fleche vers le haut).
                </li>
                <li>
                  Choisissez <strong>&laquo; Sur l&apos;ecran d&apos;accueil &raquo;</strong>, puis <strong>Ajouter</strong>.
                </li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>
                  Ouvrez le menu du navigateur (<strong>&#8942;</strong> sur Chrome).
                </li>
                <li>
                  Touchez <strong>&laquo; Installer l&apos;application &raquo;</strong> ou{" "}
                  <strong>&laquo; Ajouter a l&apos;ecran d&apos;accueil &raquo;</strong>.
                </li>
              </ol>
            )}
            <p className="text-xs text-gray-500 mt-3">L&apos;icone apparait ensuite sur votre telephone comme une application.</p>
            <button onClick={() => setHelp(false)} className="mt-4 w-full bg-brand text-white rounded-lg py-2.5 font-medium">
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
