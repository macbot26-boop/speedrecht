// Ratenbegrenzung pro Instanz (Fluid Compute hält Instanzen warm; für die
// Testphase ausreichend — kein externer Dienst nötig).
//
// Der Schlüssel (typisch: die Client-IP) lebt nur im Arbeitsspeicher und
// wird weder gespeichert noch geloggt.

export function ratenBegrenzer(proMinute: number): (key: string) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return function begrenzt(key: string): boolean {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      if (buckets.size > 10_000) buckets.clear(); // Speicher-Backstop
      return false;
    }
    bucket.count += 1;
    return bucket.count > proMinute;
  };
}
