"use client";

import { useEffect } from "react";

// Registriert den Service Worker (PWA). Nur im Production-Build aktiv,
// damit der Cache die Entwicklung nicht stört.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ohne Service Worker funktioniert die Seite trotzdem — nur nicht offline.
    });
  }, []);
  return null;
}
