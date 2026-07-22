import type { Metadata } from "next";
import { MessungFlow } from "@/components/messung-flow";

export const metadata: Metadata = {
  title: "Messung — Speedrecht",
  description:
    "Miss deine echte Internet-Geschwindigkeit mit der offiziellen Messmethodik der Breitbandmessung.",
};

export default function MessungPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="flex w-full flex-col items-center">
        <MessungFlow />
      </main>
    </div>
  );
}
