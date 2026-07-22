import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Test-Werkstatt: Das Handy im Heimnetz öffnet den Dev-Server über die
  // LAN-Adresse des Macs — ohne diese Freigabe blockiert Next die
  // Skript-Dateien (Seite lädt, aber nichts reagiert). Nur im Dev-Modus
  // wirksam; typische Heimnetz-Adressen (192.168.x.x) sind abgedeckt.
  allowedDevOrigins: ["192.168.188.55", "192.168.*.*", "*.local"],
};

export default nextConfig;
