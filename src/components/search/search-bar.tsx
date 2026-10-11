"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Search, Tag, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { addRecentSearch } from "@/features/search/recent-searches";

interface Suggestion {
  kind: "place" | "category" | "unit";
  label: string;
  sublabel: string | null;
  slug: string;
  ref_id: string;
}

/** Barre de recherche avec suggestions instantanées (debounce 220 ms, annulation des requêtes obsolètes). */
export function SearchBar({ defaultValue = "", autoFocus = false, size = "lg" }: { defaultValue?: string; autoFocus?: boolean; size?: "lg" | "md" }) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);

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
    go(`/recherche?q=${encodeURIComponent(trimmed)}`);
  }

  function hrefFor(s: Suggestion) {
    if (s.kind === "place") return `/lieux/${s.slug}`;
    if (s.kind === "category") return `/categories/${s.slug}`;
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
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
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
        className={`w-full rounded-2xl border border-line bg-surface pl-12 pr-12 shadow-[var(--shadow-card)] outline-none transition-shadow placeholder:text-muted focus:border-brand/50 focus:ring-4 focus:ring-brand/10 ${height}`}
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted" aria-label="Chargement" />
        ) : value ? (
          <button type="button" onClick={() => setValue("")} className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label="Effacer">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="animate-fade-up absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-surface py-1.5 shadow-[var(--shadow-float)]"
        >
          {items.map((s, i) => (
            <li key={`${s.kind}-${s.ref_id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(hrefFor(s))}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === active ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                {s.kind === "place" ? (
                  <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
                ) : s.kind === "category" ? (
                  <Tag className="size-4 shrink-0 text-brand" aria-hidden="true" />
                ) : (
                  <MapPin className="size-4 shrink-0 text-cyan" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.label}</span>
                  {s.sublabel && <span className="block truncate text-xs text-muted">{s.sublabel}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
