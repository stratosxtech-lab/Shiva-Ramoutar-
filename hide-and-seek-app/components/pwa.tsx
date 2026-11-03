"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker so the app can be installed on a phone's home screen. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}

/** "Install app" button on Android and desktop Chrome, and Add to Home Screen instructions on iPhone. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem("hs:install-dismissed") === "1"; } catch {}
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos);
    if (isIos) setHidden(false);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); setHidden(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;
  const dismiss = () => { setHidden(true); try { localStorage.setItem("hs:install-dismissed", "1"); } catch {} };
  return (
    <div className="card" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 10 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>Get the Hide &amp; Seek app</b>
        <p className="muted">{ios ? "Tap the Share button, then “Add to Home Screen”." : "Install it on your phone for full-screen play."}</p>
      </div>
      {evt && <button className="btn sm" onClick={async () => { await evt.prompt(); setHidden(true); }}>Install</button>}
      <button className="btn ghost sm" onClick={dismiss} aria-label="Dismiss">Not now</button>
    </div>
  );
}
