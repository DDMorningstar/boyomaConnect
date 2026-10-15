"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Mic, Search, Tag, X } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { addRecentSearch } from "@/features/search/recent-searches";

interface Suggestion {
  kind: "place" | "category" | "unit" | "zone";
  label: string;
  sublabel: string | null;
  slug: string;
  ref_id: string;
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;
/** Reconnaissance vocale du navigateur (Chrome Android notamment) ; null si indisponible. */
function speechCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Barre de recherche avec suggestions instantanées (debounce 220 ms, annulation des requêtes obsolètes). */
export function SearchBar({
  defaultValue = "",
  autoFocus = false,
  size = "lg",
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  size?: "lg" | "md";
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => setCanSpeak(speechCtor() !== null), []);

  function listen() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    haptic();
    setVoiceError(null);
    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
      if (text) {
        setValue(text);
        submit(text);
      }
    };
    rec.onerror = (e) =>
      setVoiceError(
        e.error === "not-allowed"
          ? "Autorisez le micro pour chercher à la voix."
          : "Je n'ai pas compris, réessayez.",
      );
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      const { data, error } = await getSupabaseBrowserClient()
        .rpc("search_suggestions", { p_query: q, p_limit: 8 })
        .abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      setLoading(false);
      setItems(error ? [] : ((data as Suggestion[] | null) ?? []));
      setActive(-1);
    }, 220);
    return () => clearTimeout(timer);
  }, [value]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    addRecentSearch(trimmed);
    // La zone active (mémorisée) s'applique à /recherche ; aucun paramètre à ajouter ici.
    go(`/recherche?q=${encodeURIComponent(trimmed)}`);
  }

  function hrefFor(s: Suggestion) {
    if (s.kind === "place") return `/lieux/${s.slug}`;
    if (s.kind === "category") return `/categories/${s.slug}`;
    if (s.kind === "zone") return `/zones/${s.slug}`;
    return `/communes/${s.slug}`;
  }

  const height = size === "lg" ? "h-14 text-base" : "h-12 text-[15px]";

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const chosen = active >= 0 ? items[active] : undefined;
        if (chosen) go(hrefFor(chosen));
        else submit(value);
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Rechercher un lieu, un service, une catégorie ou une commune
      </label>
      <Search
        className="text-muted pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
        aria-hidden="true"
      />
      <input
        id={`${listId}-input`}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        maxLength={120}
        placeholder="Pharmacie, hôtel, garage, quartier…"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, -1));
          } else if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={`border-line bg-surface placeholder:text-muted focus:border-brand/50 focus:ring-brand/10 w-full rounded-2xl border pr-12 pl-12 shadow-[var(--shadow-card)] transition-shadow outline-none focus:ring-4 ${height}`}
      />
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
        {loading ? (
          <Loader2 className="text-muted size-5 animate-spin" aria-label="Chargement" />
        ) : value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            className="text-muted hover:bg-surface-2 rounded-full p-1.5"
            aria-label="Effacer"
          >
            <X className="size-4" />
          </button>
        ) : canSpeak ? (
          <button
            type="button"
            onClick={listen}
            aria-pressed={listening}
            aria-label={listening ? "Arrêter l'écoute" : "Chercher à la voix"}
            className={`rounded-full p-2 transition-colors ${listening ? "bg-brand text-white motion-safe:animate-pulse" : "text-muted hover:bg-surface-2"}`}
          >
            <Mic className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {(listening || voiceError) && (
        <p role="status" className="text-muted mt-2 text-center text-sm">
          {listening ? "Je vous écoute… dites par exemple « pharmacie Makiso »." : voiceError}
        </p>
      )}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="animate-fade-up border-line bg-surface absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border py-1.5 shadow-[var(--shadow-float)]"
        >
          {items.map((s, i) => (
            <li
              key={`${s.kind}-${s.ref_id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
            >
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(hrefFor(s))}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === active ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                {s.kind === "place" ? (
                  <Search className="text-muted size-4 shrink-0" aria-hidden="true" />
                ) : s.kind === "category" ? (
                  <Tag className="text-brand size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <MapPin className="text-cyan size-4 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.label}</span>
                  {s.sublabel && <span className="text-muted block truncate text-xs">{s.sublabel}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
