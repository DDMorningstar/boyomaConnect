"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bike, Check, Heart, MessageCircle, Navigation, Phone, Share2 } from "lucide-react";
import { recordPlaceEvent } from "@/features/places/events";
import { useFavorites, type FavoriteSnapshot } from "@/features/favorites/store";
import { toWhatsAppNumber } from "@/lib/format";
import { haptic } from "@/lib/haptics";

interface Props {
  place: Omit<FavoriteSnapshot, "saved_at">;
  phone: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Adresse et localité, pour le message envoyé à un taxi-moto. */
  address?: string | null;
  locality?: string | null;
}

/** Message WhatsApp « emmenez-moi ici » (taxi-moto, ami) : nom, repère, adresse, position. */
export function rideMessage(p: {
  name: string;
  landmark?: string | null;
  address?: string | null;
  locality?: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  const lines = [`Bonjour, pouvez-vous m'emmener à : ${p.name}`];
  if (p.landmark) lines.push(`Repère : ${p.landmark}`);
  if (p.address) lines.push(`Adresse : ${p.address}`);
  if (p.locality) lines.push(p.locality);
  if (p.latitude != null && p.longitude != null)
    lines.push(`Position : https://maps.google.com/?q=${p.latitude},${p.longitude}`);
  return lines.join("\n");
}

/** Actions principales d'une fiche. Chaque bouton déclenche une action réelle. */
export function PlaceActions({ place, phone, whatsapp, latitude, longitude, address, locality }: Props) {
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

  const canRide = hasCoords || Boolean(place.landmark_description) || Boolean(address);
  const ride = canRide
    ? `https://wa.me/?text=${encodeURIComponent(rideMessage({ name: place.name, landmark: place.landmark_description, address, locality, latitude, longitude }))}`
    : null;

  return (
    <div className="space-y-2">
      <div className="border-line bg-surface grid grid-cols-5 gap-1 rounded-[var(--radius-card)] border p-2 shadow-[var(--shadow-card)]">
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s/g, "")}`}
            onClick={() => {
              haptic();
              recordPlaceEvent(place.id, "phone_click");
            }}
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
            onClick={() => {
              haptic();
              recordPlaceEvent(place.id, "whatsapp_click");
            }}
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
            onClick={() => {
              haptic();
              recordPlaceEvent(place.id, "directions_request");
            }}
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
            if (toggle(place)) {
              haptic("success");
              recordPlaceEvent(place.id, "favorite_add");
            } else haptic();
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
      {ride && (
        <a
          href={ride}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            haptic();
            recordPlaceEvent(place.id, "share");
          }}
          className="border-line bg-surface hover:bg-surface-2 flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold"
        >
          <Bike className="size-4" aria-hidden="true" /> Envoyer l&apos;adresse à un taxi-moto (WhatsApp)
        </a>
      )}
    </div>
  );
}

/**
 * Mobile : barre d'actions fixe (Appeler, WhatsApp, Itinéraire) qui apparaît quand les actions
 * principales de la fiche sont sorties de l'écran par le haut. Masquée sur grand écran.
 */
export function StickyPlaceActions({
  placeId,
  name,
  phone,
  whatsapp,
  latitude,
  longitude,
  watchId,
}: {
  placeId: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
  watchId: string;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wa = whatsapp ? toWhatsAppNumber(whatsapp) : null;
  const hasCoords = latitude != null && longitude != null;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const target = document.getElementById(watchId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  if (!mounted || (!phone && !wa && !hasCoords)) return null;
  const btn =
    "flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90";
  // Rendue dans <body> : l'animation d'entrée de page (transform) ferait sinon de son conteneur la
  // référence du « position: fixed », et la barre sortirait de l'écran.
  return createPortal(
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={`border-line bg-surface/95 fixed inset-x-3 z-30 flex items-center gap-2 rounded-2xl border p-2 pl-4 shadow-[var(--shadow-float)] backdrop-blur-lg transition-[transform,opacity] duration-300 ease-out md:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[130%] opacity-0"
      }`}
      style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
    >
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</p>
      {hasCoords && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordPlaceEvent(placeId, "directions_request")}
          aria-label="Itinéraire"
          className={`${btn} bg-night dark:bg-surface-2 text-white`}
        >
          <Navigation className="size-5" aria-hidden="true" />
        </a>
      )}
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordPlaceEvent(placeId, "whatsapp_click")}
          aria-label="WhatsApp"
          className={`${btn} bg-[#25D366] text-white`}
        >
          <MessageCircle className="size-5" aria-hidden="true" />
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone.replace(/\s/g, "")}`}
          onClick={() => recordPlaceEvent(placeId, "phone_click")}
          className="bg-brand inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white transition-transform active:scale-95"
        >
          <Phone className="size-4" aria-hidden="true" /> Appeler
        </a>
      )}
    </div>,
    document.body,
  );
}
