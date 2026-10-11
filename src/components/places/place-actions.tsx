"use client";
import { useState } from "react";
import { Check, Heart, MessageCircle, Navigation, Phone, Share2 } from "lucide-react";
import { recordPlaceEvent } from "@/features/places/events";
import { useFavorites, type FavoriteSnapshot } from "@/features/favorites/store";
import { toWhatsAppNumber } from "@/lib/format";

interface Props {
  place: Omit<FavoriteSnapshot, "saved_at">;
  phone: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Actions principales d'une fiche. Chaque bouton déclenche une action réelle. */
export function PlaceActions({ place, phone, whatsapp, latitude, longitude }: Props) {
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(place.id);
  const [shared, setShared] = useState(false);
  const wa = whatsapp ? toWhatsAppNumber(whatsapp) : null;
  const hasCoords = latitude != null && longitude != null;

  async function share() {
    const url = `${window.location.origin}/lieux/${place.slug}`;
    const data = { title: place.name, text: `${place.name} — sur Boyoma Connect`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
      recordPlaceEvent(place.id, "share");
    } catch {
      /* partage annulé par l'utilisateur */
    }
  }

  const item =
    "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-xs font-medium transition-transform active:scale-95";
  const circle = "flex size-12 items-center justify-center rounded-full";

  return (
    <div className="border-line bg-surface grid grid-cols-5 gap-1 rounded-[var(--radius-card)] border p-2 shadow-[var(--shadow-card)]">
      {phone ? (
        <a
          href={`tel:${phone.replace(/\s/g, "")}`}
          onClick={() => recordPlaceEvent(place.id, "phone_click")}
          className={item}
        >
          <span className={`${circle} bg-brand text-white`}>
            <Phone className="size-5" aria-hidden="true" />
          </span>
          Appeler
        </a>
      ) : (
        <span className={`${item} opacity-40`} aria-disabled="true" title="Numéro non renseigné">
          <span className={`${circle} bg-surface-2`}>
            <Phone className="size-5" aria-hidden="true" />
          </span>
          Appeler
        </span>
      )}
      {wa ? (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordPlaceEvent(place.id, "whatsapp_click")}
          className={item}
        >
          <span className={`${circle} bg-[#25D366] text-white`}>
            <MessageCircle className="size-5" aria-hidden="true" />
          </span>
          WhatsApp
        </a>
      ) : (
        <span className={`${item} opacity-40`} aria-disabled="true" title="WhatsApp non renseigné">
          <span className={`${circle} bg-surface-2`}>
            <MessageCircle className="size-5" aria-hidden="true" />
          </span>
          WhatsApp
        </span>
      )}
      {hasCoords ? (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordPlaceEvent(place.id, "directions_request")}
          className={item}
        >
          <span className={`${circle} bg-night dark:bg-surface-2 text-white`}>
            <Navigation className="size-5" aria-hidden="true" />
          </span>
          Itinéraire
        </a>
      ) : (
        <span className={`${item} opacity-40`} aria-disabled="true" title="Position GPS non renseignée">
          <span className={`${circle} bg-surface-2`}>
            <Navigation className="size-5" aria-hidden="true" />
          </span>
          Itinéraire
        </span>
      )}
      <button type="button" onClick={share} className={item}>
        <span className={`${circle} bg-surface-2`}>
          {shared ? (
            <Check className="text-success size-5" aria-hidden="true" />
          ) : (
            <Share2 className="size-5" aria-hidden="true" />
          )}
        </span>
        {shared ? "Lien copié" : "Partager"}
      </button>
      <button
        type="button"
        aria-pressed={fav}
        onClick={() => {
          if (toggle(place)) recordPlaceEvent(place.id, "favorite_add");
        }}
        className={item}
      >
        <span
          className={`${circle} transition-colors ${fav ? "bg-rose-500/15 text-rose-500" : "bg-surface-2"}`}
        >
          <Heart
            className={`size-5 transition-transform ${fav ? "scale-110 fill-current" : ""}`}
            aria-hidden="true"
          />
        </span>
        {fav ? "Enregistré" : "Favori"}
      </button>
    </div>
  );
}
