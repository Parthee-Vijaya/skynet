"use client";
import { useEffect } from "react";

/**
 * Registrerer service workeren på klient-siden. Er tavs ved fejl
 * (fx Safari private mode) så PWA'en degraderer elegant.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Vent til side er loaded så SW-registrering ikke blokerer første render
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* stille */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);
  return null;
}
