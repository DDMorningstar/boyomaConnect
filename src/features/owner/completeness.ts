import type { ManagedPlace } from "./queries";

export interface CompletenessStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
  weight: number;
}

/** Score de complétude : chaque étape rend la fiche plus utile aux visiteurs. */
export function completeness(place: ManagedPlace): { score: number; steps: CompletenessStep[] } {
  const base = `/espace-pro/lieux/${place.id}`;
  const has = (kind: string) => place.place_contacts.some((c) => c.kind === kind);
  const photos = place.place_media.filter((m) => m.kind === "gallery" || m.kind === "cover").length;
  const published = place.catalog_items.filter((i) => i.is_published).length;
  const steps: CompletenessStep[] = [
    {
      key: "logo",
      label: "Ajouter un logo",
      done: Boolean(place.logo_path),
      href: `${base}/fiche#logo`,
      weight: 15,
    },
    {
      key: "photos",
      label: "Publier au moins 2 photos",
      done: photos >= 2,
      href: `${base}/fiche#photos`,
      weight: 15,
    },
    {
      key: "phone",
      label: "Téléphone public",
      done: has("phone"),
      href: `${base}/fiche#contacts`,
      weight: 15,
    },
    {
      key: "whatsapp",
      label: "Numéro WhatsApp",
      done: has("whatsapp"),
      href: `${base}/fiche#contacts`,
      weight: 10,
    },
    {
      key: "description",
      label: "Présentation courte",
      done: Boolean(place.short_description),
      href: `${base}/fiche#informations`,
      weight: 10,
    },
    {
      key: "hours",
      label: "Horaires d'ouverture",
      done: place.place_hours.length > 0,
      href: `${base}/horaires`,
      weight: 15,
    },
    {
      key: "catalog",
      label: "3 articles au catalogue",
      done: published >= 3,
      href: `${base}/catalogue`,
      weight: 15,
    },
    {
      key: "landmark",
      label: "Repère ou indications d'accès",
      done: Boolean(place.landmark_description || place.directions),
      href: `${base}/fiche#informations`,
      weight: 5,
    },
  ];
  const score = steps.reduce((s, st) => s + (st.done ? st.weight : 0), 0);
  return { score, steps };
}
