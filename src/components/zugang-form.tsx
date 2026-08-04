"use client";

import { useState } from "react";

export function ZugangForm({ target }: { target: string }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "wrong">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || status === "checking") return;
    setStatus("checking");
    try {
      const res = await fetch("/api/zugang", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.ok) {
        window.location.assign(target);
        return;
      }
    } catch {
      // Netzwerkfehler → wie falscher Code behandeln
    }
    setStatus("wrong");
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3">
      <input
        type="password"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          if (status === "wrong") setStatus("idle");
        }}
        placeholder="Einladungscode"
        autoFocus
        autoComplete="off"
        className="w-full rounded-xl border border-linie-stark bg-flaeche px-4 py-3 text-center text-lg tracking-widest text-tinte outline-none focus:border-signal"
      />
      {status === "wrong" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Der Code stimmt nicht.
        </p>
      )}
      <button
        type="submit"
        disabled={status === "checking" || !code.trim()}
        className="rounded-xl bg-signal px-6 py-3 text-sm font-semibold text-white transition hover:bg-signal-aktiv disabled:opacity-50"
      >
        {status === "checking" ? "Wird geprüft …" : "Weiter"}
      </button>
    </form>
  );
}
