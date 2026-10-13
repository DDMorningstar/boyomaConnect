import { CalendarClock, Clock } from "lucide-react";
import type { PlaceHour } from "@/types/places";
import type { SpecialHour } from "@/features/places/engagement";
import { formatDate } from "@/lib/format";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const t = (v: string | null) => (v ? v.slice(0, 5).replace(":", " h ") : "");
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("fr-CD", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Horaires : affichés uniquement s'ils existent (jamais supposés). Les horaires exceptionnels des
 * 14 prochains jours (fermeture, jour férié) sont signalés au-dessus de la semaine type.
 */
export function OpeningHours({
  hours,
  verifiedAt,
  special = [],
  today,
}: {
  hours: PlaceHour[];
  verifiedAt: string | null;
  special?: SpecialHour[];
  today?: string;
}) {
  const todaySpecial = special.find((s) => s.date === today);
  const upcoming = special.filter((s) => s.date !== today);
  return (
    <div className="space-y-3">
      {todaySpecial && (
        <p
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            todaySpecial.is_closed ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
          }`}
        >
          {todaySpecial.is_closed
            ? "Fermé aujourd'hui"
            : `Aujourd'hui : ${t(todaySpecial.opens_at)} – ${t(todaySpecial.closes_at)}`}
          {todaySpecial.note && <span className="block text-xs font-normal">{todaySpecial.note}</span>}
        </p>
      )}
      {upcoming.length > 0 && (
        <ul className="space-y-1 text-sm">
          {upcoming.map((s) => (
            <li key={s.date} className="flex items-start gap-2">
              <CalendarClock className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium first-letter:uppercase">{dayLabel(s.date)}</span> :{" "}
                {s.is_closed ? "fermé" : `${t(s.opens_at)} – ${t(s.closes_at)}`}
                {s.note && <span className="text-muted"> · {s.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hours.length === 0 ? (
        <p className="text-muted flex items-center gap-2 text-sm">
          <Clock className="size-4" aria-hidden="true" /> Horaires non renseignés.
        </p>
      ) : (
        <div>
          <dl className="divide-line divide-y text-sm">
            {DAYS.map((label, i) => {
              const slots = hours
                .filter((h) => h.day_of_week === i + 1)
                .sort((a, b) => (a.opens_at ?? "").localeCompare(b.opens_at ?? ""));
              return (
                <div key={label} className="flex justify-between py-2">
                  <dt className="font-medium">{label}</dt>
                  <dd className="text-muted text-right">
                    {slots.length === 0
                      ? "—"
                      : slots.some((s) => s.is_closed)
                        ? "Fermé"
                        : slots.map((s) => `${t(s.opens_at)} – ${t(s.closes_at)}`).join(", ")}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="text-muted mt-2 text-xs">
            {verifiedAt
              ? `Horaires mis à jour le ${formatDate(verifiedAt)}.`
              : "Horaires déclarés, non vérifiés par Boyoma Connect."}
          </p>
        </div>
      )}
    </div>
  );
}
