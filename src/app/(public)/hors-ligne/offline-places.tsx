"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { readSavedPlaces, type SavedPlace } from "@/features/offline/saved-places";
import { toWhatsAppNumber } from "@/lib/format";

/** Fiches consultées récemment, gardées sur l'appareil : contact possible sans réseau (appel direct). */
export function OfflinePlaces() {
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  useEffect(() => setPlaces(readSavedPlaces()), []);
  if (!places || places.length === 0) return null;
  return (
    <section className="mt-10 w-full max-w-xl text-left">
      <h2 className="mb-1 text-lg font-bold">Fiches gardées sur cet appareil</h2>
      <p className="text-muted mb-4 text-sm">
        L&apos;appel fonctionne sans Internet. WhatsApp s&apos;ouvrira au retour du réseau.
      </p>
      <ul className="space-y-3">
        {places.map((p) => {
          const wa = p.whatsapp ? toWhatsAppNumber(p.whatsapp) : null;
          return (
            <li key={p.slug} className="border-line bg-surface rounded-[var(--radius-card)] border p-4">
              <Link href={`/lieux/${p.slug}`} className="block font-semibold">
                {p.name}
              </Link>
              <p className="text-muted text-sm">{[p.category, p.locality].filter(Boolean).join(" · ")}</p>
              {(p.landmark || p.address) && (
                <p className="mt-1 flex items-start gap-1.5 text-sm">
                  <MapPin className="text-muted mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {[p.landmark && `Repère : ${p.landmark}`, p.address].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.phone && (
                  <a
                    href={`tel:${p.phone.replace(/\s/g, "")}`}
                    className="bg-brand inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white"
                  >
                    <Phone className="size-4" aria-hidden="true" /> Appeler
                  </a>
                )}
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
