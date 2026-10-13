"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Check,
  Link2,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Search,
  Send,
  ShoppingBag,
  Star,
  Wrench,
  X,
} from "lucide-react";
import { recordCatalogEvent, recordPlaceEvent } from "@/features/places/events";
import { InquiryForm } from "@/components/places/inquiry-form";
import {
  AVAILABILITY,
  catalogPrice,
  inquiryMessage,
  visibleCatalog,
  type CatalogEntry,
} from "@/features/catalog/format";
import { toWhatsAppNumber } from "@/lib/format";
import { placeMediaUrl } from "@/lib/supabase/storage";

interface Props {
  placeId: string;
  placeName: string;
  placeSlug: string;
  items: CatalogEntry[];
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
}

type Filter =
  { kind: "all" } | { kind: "type"; value: CatalogEntry["kind"] } | { kind: "section"; value: string };

const HASH = "#article-";

/**
 * Catalogue public (décision D31) : vitrine des produits et services. Un article s'ouvre en fiche
 * détaillée avec contact direct (appel, WhatsApp ou e-mail pré-rempli). Aucune commande ni paiement.
 */
export function CatalogSection({ placeId, placeName, placeSlug, items, phone, whatsapp, email }: Props) {
  const list = useMemo(() => visibleCatalog(items), [items]);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const kinds = new Set(list.map((i) => i.kind));
  const sections = [...new Set(list.map((i) => i.category_label).filter((s): s is string => Boolean(s)))];
  const q = query.trim().toLowerCase();
  const shown = list.filter((i) => {
    if (filter.kind === "type" && i.kind !== filter.value) return false;
    if (filter.kind === "section" && i.category_label !== filter.value) return false;
    return !q || `${i.name} ${i.description ?? ""} ${i.category_label ?? ""}`.toLowerCase().includes(q);
  });

  // Lien direct vers un article (#article-<id>) : partage d'un produit précis.
  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.startsWith(HASH) ? window.location.hash.slice(HASH.length) : null;
      setOpenId(id && list.some((i) => i.id === id) ? id : null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [list]);

  const open = (id: string) => {
    history.replaceState(null, "", `${HASH}${id}`);
    setOpenId(id);
  };
  const close = useCallback(() => {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setOpenId(null);
  }, []);

  if (!list.length) return null;
  const selected = list.find((i) => i.id === openId) ?? null;
  const chip = (on: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors ${
      on ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand/40"
    }`;
  const same = (f: Filter) => JSON.stringify(f) === JSON.stringify(filter);

  return (
    <section aria-labelledby="catalogue">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="catalogue" className="flex items-center gap-2 text-lg font-bold">
          <ShoppingBag className="text-brand size-5" aria-hidden="true" /> Catalogue
          <span className="bg-surface-2 text-muted rounded-full px-2 py-0.5 text-xs font-semibold">
            {list.length}
          </span>
        </h2>
      </div>

      {(kinds.size > 1 || sections.length > 0) && (
        <div
          className="-mx-4 mb-3 flex scrollbar-none gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
          role="group"
          aria-label="Filtrer le catalogue"
        >
          <button
            type="button"
            className={chip(same({ kind: "all" }))}
            onClick={() => setFilter({ kind: "all" })}
          >
            Tout
          </button>
          {kinds.size > 1 && (
            <>
              <button
                type="button"
                className={chip(same({ kind: "type", value: "product" }))}
                onClick={() => setFilter({ kind: "type", value: "product" })}
              >
                Produits
              </button>
              <button
                type="button"
                className={chip(same({ kind: "type", value: "service" }))}
                onClick={() => setFilter({ kind: "type", value: "service" })}
              >
                Services
              </button>
            </>
          )}
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              className={chip(same({ kind: "section", value: s }))}
              onClick={() => setFilter({ kind: "section", value: s })}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {list.length > 8 && (
        <label className="relative mb-3 block">
          <span className="sr-only">Rechercher dans le catalogue</span>
          <Search
            className="text-muted absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit ou un service…"
            className="border-line bg-surface focus:border-brand/50 h-11 w-full rounded-2xl border pr-4 pl-10 text-sm outline-none"
          />
        </label>
      )}

      {shown.length === 0 ? (
        <p className="text-muted border-line rounded-2xl border border-dashed p-5 text-center text-sm">
          Aucun article ne correspond.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {shown.map((it, i) => (
            <li key={it.id}>
              <ItemCard item={it} index={i} onOpen={() => open(it.id)} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted mt-2 text-xs">
        Prix et disponibilités indiqués par l&apos;établissement, susceptibles d&apos;évoluer. Contactez-le
        directement : Boyoma Connect ne prend ni commande ni paiement.
      </p>

      {selected && (
        <ItemSheet
          item={selected}
          placeId={placeId}
          placeName={placeName}
          placeSlug={placeSlug}
          phone={phone}
          whatsapp={whatsapp}
          email={email}
          onClose={close}
        />
      )}
    </section>
  );
}

function Placeholder({ kind, large = false }: { kind: CatalogEntry["kind"]; large?: boolean }) {
  const Icon = kind === "service" ? Wrench : Package;
  return (
    <span className="from-brand/15 to-cyan/15 text-brand flex size-full items-center justify-center bg-gradient-to-br">
      <Icon className={large ? "size-14" : "size-8"} aria-hidden="true" />
    </span>
  );
}

function ItemCard({ item, index, onOpen }: { item: CatalogEntry; index: number; onOpen: () => void }) {
  const photo = placeMediaUrl(item.photo_paths[0]);
  const price = catalogPrice(item);
  const unavailable = item.availability === "unavailable";
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className="group animate-fade-up border-line bg-surface hover:border-brand/30 flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] border text-left shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] active:scale-[0.98]"
    >
      <div className="bg-surface-2 relative aspect-square w-full overflow-hidden">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes="(min-width: 768px) 360px, 50vw"
            className={`object-cover transition-transform duration-500 group-hover:scale-[1.04] ${unavailable ? "grayscale" : ""}`}
          />
        ) : (
          <Placeholder kind={item.kind} />
        )}
        {item.is_featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950 shadow-sm">
            <Star className="size-3 fill-current" aria-hidden="true" /> À la une
          </span>
        )}
        {unavailable && (
          <span className="bg-night/80 absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
            Indisponible
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-muted text-[11px] font-semibold tracking-wide uppercase">
          {item.category_label ?? (item.kind === "service" ? "Service" : "Produit")}
        </span>
        <span className="line-clamp-2 text-sm leading-snug font-semibold">{item.name}</span>
        <span
          className={`mt-auto pt-1 text-sm font-extrabold ${price ? "text-ink" : "text-muted font-medium"}`}
        >
          {price ?? "Prix sur demande"}
        </span>
      </div>
    </button>
  );
}

function ItemSheet({
  item,
  placeId,
  placeName,
  placeSlug,
  phone,
  whatsapp,
  email,
  onClose,
}: {
  item: CatalogEntry;
  placeId: string;
  placeName: string;
  placeSlug: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  onClose: () => void;
}) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const photo = placeMediaUrl(item.photo_paths[0]);
  const price = catalogPrice(item);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/lieux/${placeSlug}${HASH}${item.id}`;
  const message = inquiryMessage(placeName, { name: item.name, priceLabel: price }, url);
  const wa = whatsapp ? toWhatsAppNumber(whatsapp) : null;

  useEffect(() => {
    recordCatalogEvent(item.id, "view");
  }, [item.id]);

  useEffect(() => {
    closeBtn.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `${item.name} — ${placeName}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      recordPlaceEvent(placeId, "share");
    } catch {
      /* partage annulé */
    }
  }

  const action =
    "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition-transform active:scale-[0.97]";
  const disabled = `${action} bg-surface-2 text-muted cursor-not-allowed opacity-60`;

  // Rendu dans <body> : indépendant des transformations de la page (animation d'entrée).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="article-titre"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="animate-sheet-up bg-surface relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] shadow-[var(--shadow-float)] md:rounded-[1.75rem]">
        <div className="overflow-y-auto">
          <div className="bg-surface-2 relative aspect-[4/3] w-full">
            {photo ? (
              <Image src={photo} alt={item.name} fill sizes="512px" className="object-cover" />
            ) : (
              <Placeholder kind={item.kind} large />
            )}
            <button
              ref={closeBtn}
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="bg-night/70 absolute top-3 right-3 rounded-full p-2 text-white backdrop-blur"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="bg-surface-2 rounded-full px-2.5 py-1">
                {item.kind === "service" ? "Service" : "Produit"}
              </span>
              {item.category_label && (
                <span className="bg-surface-2 rounded-full px-2.5 py-1">{item.category_label}</span>
              )}
              {item.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-600 dark:text-amber-300">
                  <Star className="size-3 fill-current" aria-hidden="true" /> À la une
                </span>
              )}
            </div>
            <h3 id="article-titre" className="text-xl leading-tight font-extrabold tracking-tight">
              {item.name}
            </h3>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-2xl font-extrabold">
                {price ?? <span className="text-muted text-base font-medium">Prix sur demande</span>}
              </p>
              <p
                className={`text-sm font-medium ${
                  item.availability === "available"
                    ? "text-success"
                    : item.availability === "unavailable"
                      ? "text-danger"
                      : "text-muted"
                }`}
              >
                {AVAILABILITY[item.availability]}
              </p>
            </div>
            {item.description && (
              <p className="text-muted text-[15px] leading-relaxed whitespace-pre-line">{item.description}</p>
            )}
            <p className="text-muted text-xs">
              Proposé par {placeName}. Prix indiqués par l&apos;établissement.
            </p>
            {asking && (
              <div ref={formRef} className="border-line scroll-mt-4 border-t pt-4">
                <h4 className="mb-3 font-bold">Demander un devis ou une information</h4>
                <InquiryForm
                  placeId={placeId}
                  placeName={placeName}
                  item={{ id: item.id, name: item.name }}
                  onSent={() => recordCatalogEvent(item.id, "contact")}
                  compact
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-line space-y-2 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p className="text-muted text-center text-xs">
            Intéressé ? Contactez directement l&apos;établissement :
          </p>
          <div className="flex gap-2">
            {phone ? (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                onClick={() => {
                  recordPlaceEvent(placeId, "phone_click");
                  recordCatalogEvent(item.id, "contact");
                }}
                className={`${action} bg-brand text-white`}
              >
                <Phone className="size-4" aria-hidden="true" /> Appeler
              </a>
            ) : (
              <span className={disabled} title="Numéro non renseigné">
                <Phone className="size-4" aria-hidden="true" /> Appeler
              </span>
            )}
            {wa ? (
              <a
                href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  recordPlaceEvent(placeId, "whatsapp_click");
                  recordCatalogEvent(item.id, "contact");
                }}
                className={`${action} bg-[#25D366] text-white`}
              >
                <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
              </a>
            ) : (
              <span className={disabled} title="WhatsApp non renseigné">
                <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {email ? (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(`Demande : ${item.name}`)}&body=${encodeURIComponent(message)}`}
                onClick={() => recordCatalogEvent(item.id, "contact")}
                className={`${action} border-line bg-surface border`}
              >
                <Mail className="size-4" aria-hidden="true" /> E-mail
              </a>
            ) : (
              <span className={`${disabled} border-line border`} title="E-mail non renseigné">
                <Mail className="size-4" aria-hidden="true" /> E-mail
              </span>
            )}
            <button type="button" onClick={share} className={`${action} border-line bg-surface border`}>
              {copied ? (
                <Check className="text-success size-4" aria-hidden="true" />
              ) : (
                <Link2 className="size-4" aria-hidden="true" />
              )}
              {copied ? "Lien copié" : "Partager"}
            </button>
          </div>
          {!asking && (
            <button
              type="button"
              onClick={() => {
                setAsking(true);
                requestAnimationFrame(() =>
                  formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                );
              }}
              className="text-brand flex min-h-10 w-full items-center justify-center gap-2 text-sm font-semibold"
            >
              <Send className="size-4" aria-hidden="true" /> Envoyer un message à l&apos;établissement
            </button>
          )}
          {wa && (
            <p className="text-muted text-center text-[11px]">
              Le message WhatsApp cite l&apos;article et son prix.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
