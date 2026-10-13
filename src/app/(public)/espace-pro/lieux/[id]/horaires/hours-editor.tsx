"use client";
import { useActionState, useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { FormMessage } from "@/components/forms/form-message";
import { saveWeeklyHours, type BizState } from "@/features/owner/business-actions";

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

type Slot = { open: string; close: string };
type Day = { closed: boolean; slots: Slot[] };
type Row = { day_of_week: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const timeInput =
  "border-line bg-surface focus:border-brand w-[6.5rem] rounded-xl border px-2.5 py-2 text-sm tabular-nums outline-none";

/**
 * Semaine type : un jour sans créneau = horaires non renseignés (jamais supposés) ; « Fermé » = fermé
 * toute la journée. Deux créneaux maximum (pause de midi).
 */
export function HoursEditor({ placeId, hours }: { placeId: string; hours: Row[] }) {
  const [state, action, pending] = useActionState<BizState, FormData>(saveWeeklyHours, null);
  const [week, setWeek] = useState<Day[]>(() =>
    DAYS.map((_, i) => {
      const rows = hours.filter((h) => h.day_of_week === i + 1);
      return {
        closed: rows.some((r) => r.is_closed),
        slots: rows
          .filter((r) => !r.is_closed)
          .sort((a, b) => hhmm(a.opens_at).localeCompare(hhmm(b.opens_at)))
          .slice(0, 2)
          .map((r) => ({ open: hhmm(r.opens_at), close: hhmm(r.closes_at) })),
      };
    }),
  );
  const update = (i: number, fn: (d: Day) => Day) => setWeek((w) => w.map((d, j) => (j === i ? fn(d) : d)));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="place_id" value={placeId} />
      <ul className="divide-line divide-y">
        {week.map((d, i) => (
          <li key={DAYS[i]} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span className="w-24 font-semibold">{DAYS[i]}</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`closed-${i + 1}`}
                checked={d.closed}
                onChange={(e) => update(i, (x) => ({ ...x, closed: e.target.checked }))}
                className="accent-brand size-4"
              />
              Fermé
            </label>
            {!d.closed && (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {d.slots.length === 0 && <span className="text-muted text-sm">Non renseigné</span>}
                {d.slots.map((s, k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <input
                      type="time"
                      name={`open-${i + 1}-${k + 1}`}
                      value={s.open}
                      required
                      aria-label={`${DAYS[i]} créneau ${k + 1} : ouverture`}
                      onChange={(e) =>
                        update(i, (x) => ({
                          ...x,
                          slots: x.slots.map((y, m) => (m === k ? { ...y, open: e.target.value } : y)),
                        }))
                      }
                      className={timeInput}
                    />
                    <span className="text-muted">–</span>
                    <input
                      type="time"
                      name={`close-${i + 1}-${k + 1}`}
                      value={s.close}
                      required
                      aria-label={`${DAYS[i]} créneau ${k + 1} : fermeture`}
                      onChange={(e) =>
                        update(i, (x) => ({
                          ...x,
                          slots: x.slots.map((y, m) => (m === k ? { ...y, close: e.target.value } : y)),
                        }))
                      }
                      className={timeInput}
                    />
                    <button
                      type="button"
                      onClick={() => update(i, (x) => ({ ...x, slots: x.slots.filter((_, m) => m !== k) }))}
                      className="text-muted hover:bg-surface-2 grid size-8 place-items-center rounded-full"
                      aria-label={`Retirer ce créneau du ${DAYS[i]}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {d.slots.length < 2 && (
                  <button
                    type="button"
                    onClick={() =>
                      update(i, (x) => ({
                        ...x,
                        slots: [
                          ...x.slots,
                          x.slots.length
                            ? { open: "14:00", close: "18:00" }
                            : { open: "08:00", close: "17:00" },
                        ],
                      }))
                    }
                    className="text-brand inline-flex items-center gap-1 text-sm font-semibold"
                  >
                    <Plus className="size-4" aria-hidden="true" /> {d.slots.length ? "2e créneau" : "Ajouter"}
                  </button>
                )}
                {i < 6 && (d.slots.length > 0 || d.closed) && (
                  <button
                    type="button"
                    onClick={() =>
                      setWeek((w) =>
                        w.map((x, j) =>
                          j > i ? { closed: d.closed, slots: d.slots.map((s) => ({ ...s })) } : x,
                        ),
                      )
                    }
                    className="text-muted ml-auto inline-flex items-center gap-1 text-xs"
                    title="Appliquer ces horaires aux jours suivants"
                  >
                    <Copy className="size-3.5" aria-hidden="true" /> Copier aux jours suivants
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted text-xs">
        Un créneau qui se termine après minuit (ex. 18:00 – 02:00) est pris en compte. Les visiteurs voient «
        Ouvert » ou « Fermé » selon l&apos;heure de Kisangani.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-strong min-h-11 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enregistrer la semaine
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
