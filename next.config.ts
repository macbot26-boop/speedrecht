import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Test-Werkstatt: Das Handy im Heimnetz öffnet den Dev-Server über die
  // LAN-Adresse des Macs — ohne diese Freigabe blockiert Next die
  // Skript-Dateien (Seite lädt, aber nichts reagiert). Nur im Dev-Modus
  // wirksam; typische Heimnetz-Adressen (192.168.x.x) sind abgedeckt.
  // Dazu Tailscale: MagicDNS-Namen (*.ts.net) und die 100.x-Adressen des
  // Tailnets — bewusst als Muster, damit kein Gerätename im öffentlichen
  // Repo steht.
  allowedDevOrigins: [
    "192.168.188.55",
    "192.168.*.*",
    "*.local",
    "*.ts.net",
    "100.*.*.*",
  ],
};

export default nextConfig;
