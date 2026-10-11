"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";

export interface ViewerPhoto {
  src: string;
  alt: string;
}

/** Visionneuse plein écran : glisser, flèches du clavier, Échap pour fermer. */
export function PhotoLightbox({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: ViewerPhoto[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const count = photos.length;
  const go = useCallback(
    (delta: number) => onIndex((index + delta + count) % count),
    [index, count, onIndex],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [go, onClose]);

  const photo = photos[index];
  if (!photo) return null;
  const nav =
    "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-3 text-white backdrop-blur hover:bg-white/25";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} sur ${count}`}
      className="motion-safe:animate-fade-in fixed inset-0 z-50 flex flex-col bg-black"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start != null && end != null && Math.abs(end - start) > 50 && count > 1) go(end < start ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between p-3 text-sm text-white/80">
        <span aria-live="polite">
          {index + 1} / {count}
        </span>
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          aria-label="Fermer la visionneuse"
          className="rounded-full bg-white/15 p-2.5 text-white hover:bg-white/25"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <Image
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          fill
          sizes="100vw"
          className="object-contain"
          priority
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Photo précédente"
              className={`${nav} left-3`}
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Photo suivante"
              className={`${nav} right-3`}
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-2 p-3">
          {photos.map((p, i) => (
            <button
              key={p.src}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`Afficher la photo ${i + 1}`}
              aria-current={i === index}
              className={`relative size-12 overflow-hidden rounded-lg ring-2 ${i === index ? "ring-white" : "opacity-50 ring-transparent"}`}
            >
              <Image src={p.src} alt="" fill sizes="48px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rangée de vignettes cliquables ouvrant la visionneuse (contenue : pas de défilement de la page). */
export function PhotoStrip({
  photos,
  skip = 0,
  title,
}: {
  /** Toutes les photos (la visionneuse permet de les parcourir toutes). */
  photos: ViewerPhoto[];
  /** Nombre de premières photos déjà affichées ailleurs (couverture) et masquées dans la rangée. */
  skip?: number;
  title?: ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length <= skip) return null;
  return (
    <section className="min-w-0">
      {title}
      <ul className="flex snap-x scrollbar-none gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) =>
          i < skip ? null : (
            <li key={p.src} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`Agrandir la photo ${i + 1}`}
                className="group bg-surface-2 relative block aspect-[4/3] w-56 overflow-hidden rounded-2xl sm:w-64"
              >
                <Image
                  src={p.src}
                  alt={p.alt}
                  fill
                  sizes="256px"
                  loading="lazy"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="absolute right-2 bottom-2 rounded-full bg-black/55 p-1.5 text-white opacity-90">
                  <Expand className="size-4" aria-hidden="true" />
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
      {open != null && (
        <PhotoLightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

/** Image de couverture cliquable : ouvre la visionneuse sur l'ensemble des photos. */
export function CoverPhotoButton({ photos, children }: { photos: ViewerPhoto[]; children: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(0)}
        aria-label={`Agrandir les photos (${photos.length})`}
        className="relative block h-full w-full"
      >
        {children}
        {photos.length > 1 && (
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
            <Expand className="size-3.5" aria-hidden="true" /> {photos.length} photos
          </span>
        )}
      </button>
      {open != null && (
        <PhotoLightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
