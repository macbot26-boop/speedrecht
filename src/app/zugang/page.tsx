import type { Metadata } from "next";
import Image from "next/image";
import { ZugangForm } from "@/components/zugang-form";

export const metadata: Metadata = {
  title: "Zugang — Speedrecht",
  robots: { index: false },
};

export default async function ZugangPage({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string }>;
}) {
  const { weiter } = await searchParams;
  // Nur interne Ziele zulassen (kein offener Redirect).
  const target = weiter?.startsWith("/") && !weiter.startsWith("//") ? weiter : "/";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 sm:px-6">
      <main className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <Image src="/icon.svg" alt="Speedrecht" width={56} height={56} priority />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-tinte">
            Private Testphase
          </h1>
          <p className="text-sm leading-6 text-tinte-mittel">
            Speedrecht ist noch nicht öffentlich. Wenn du einen Einladungscode
            hast, geht es hier weiter.
          </p>
        </div>
        <ZugangForm target={target} />
      </main>
    </div>
  );
}
