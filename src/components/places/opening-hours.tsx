import { Clock } from "lucide-react";
import type { PlaceHour } from "@/types/places";
import { formatDate } from "@/lib/format";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const t = (v: string | null) => (v ? v.slice(0, 5).replace(":", " h ") : "");

/** Horaires : affichés uniquement s'ils existent ; la vérification est indiquée explicitement. */
export function OpeningHours({ hours, verifiedAt }: { hours: PlaceHour[]; verifiedAt: string | null }) {
  if (hours.length === 0) {
    return (
      <p className="text-muted flex items-center gap-2 text-sm">
        <Clock className="size-4" aria-hidden="true" /> Horaires non renseignés.
      </p>
    );
  }
  return (
    <div>
      <dl className="divide-line divide-y text-sm">
        {DAYS.map((label, i) => {
          const slots = hours.filter((h) => h.day_of_week === i + 1);
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
          ? `Horaires vérifiés le ${formatDate(verifiedAt)}.`
          : "Horaires déclarés, non vérifiés par Boyoma Connect."}
      </p>
    </div>
  );
}
