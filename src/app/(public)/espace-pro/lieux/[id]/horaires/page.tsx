import { notFound } from "next/navigation";
import { CalendarX, Trash2 } from "lucide-react";
import { inputClass, labelClass } from "@/components/forms/form-message";
import { getConsolePlace } from "@/features/owner/business";
import { addSpecialHours, deleteSpecialHours, toggleClosedToday } from "@/features/owner/business-actions";
import { ActionButton, BizForm } from "@/components/forms/action-forms";
import { Panel, shortDate } from "../ui";
import { HoursEditor } from "./hours-editor";

type Props = { params: Promise<{ id: string }> };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** Horaires : semaine type, horaires exceptionnels et fermeture du jour. */
export default async function HoursPage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lubumbashi" }).format(new Date());
  const closedToday = place.place_special_hours.some((s) => s.date === today && s.is_closed);
  const upcoming = place.place_special_hours.filter((s) => s.date >= today);
  const hidden = { place_id: place.id };

  return (
    <div className="max-w-3xl space-y-5">
      <Panel
        title="Aujourd'hui"
        description={
          closedToday
            ? "Votre fiche affiche « Fermé aujourd'hui » jusqu'à minuit."
            : "Imprévu ? Indiquez en un geste que vous êtes fermé aujourd'hui : les visiteurs le voient tout de suite."
        }
      >
        <ActionButton
          action={toggleClosedToday}
          hidden={{ ...hidden, decision: closedToday ? "off" : "on" }}
          variant={closedToday ? "primary" : "secondary"}
        >
          <CalendarX className="size-4" aria-hidden="true" />
          {closedToday ? "Rouvrir aujourd'hui (horaires habituels)" : "Fermé aujourd'hui"}
        </ActionButton>
      </Panel>

      <Panel
        title="Semaine type"
        description={
          place.hours_verified_at
            ? `Mis à jour le ${shortDate(place.hours_verified_at)}.`
            : "Renseignez vos horaires : les visiteurs savent alors si vous êtes ouvert."
        }
      >
        <HoursEditor placeId={place.id} hours={place.place_hours} />
      </Panel>

      <Panel title="Horaires exceptionnels" description="Jours fériés, inventaire, horaires réduits…">
        {upcoming.length > 0 && (
          <ul className="divide-line divide-y">
            {upcoming.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="w-32 font-semibold">{shortDate(`${s.date}T12:00:00Z`)}</span>
                <span className="flex-1">
                  {s.is_closed ? "Fermé" : `${hhmm(s.opens_at)} – ${hhmm(s.closes_at)}`}
                  {s.note && <span className="text-muted"> · {s.note}</span>}
                </span>
                <ActionButton action={deleteSpecialHours} hidden={{ ...hidden, id: s.id }} variant="danger">
                  <Trash2 className="size-3.5" aria-hidden="true" /> Retirer
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
        <BizForm action={addSpecialHours} hidden={hidden} submit="Ajouter" resetOnSuccess>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label htmlFor="sp-date" className={labelClass}>
                Date
              </label>
              <input id="sp-date" name="date" type="date" min={today} required className={inputClass} />
            </div>
            <div>
              <label htmlFor="sp-open" className={labelClass}>
                Ouverture
              </label>
              <input id="sp-open" name="opens_at" type="time" className={inputClass} />
            </div>
            <div>
              <label htmlFor="sp-close" className={labelClass}>
                Fermeture
              </label>
              <input id="sp-close" name="closes_at" type="time" className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_closed" className="accent-brand size-4" /> Fermé toute la journée
          </label>
          <div>
            <label htmlFor="sp-note" className={labelClass}>
              Note (facultatif)
            </label>
            <input
              id="sp-note"
              name="note"
              maxLength={200}
              placeholder="Ex. : fête de l'indépendance"
              className={inputClass}
            />
          </div>
        </BizForm>
      </Panel>
    </div>
  );
}
