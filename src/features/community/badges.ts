/**
 * Badges des contributeurs (décision D34). Seules les contributions validées comptent :
 * avis publiés, photos approuvées, signalements traités, établissements ajoutés et validés.
 */
export interface Contributions {
  reviews: number;
  photos: number;
  reports: number;
  places: number;
}

export type BadgeIcon = "star" | "camera" | "shield" | "map" | "trophy";

export interface BadgeDef {
  key: string;
  label: string;
  description: string;
  icon: BadgeIcon;
  goal: number;
  count: (c: Contributions) => number;
}

export const total = (c: Contributions) => c.reviews + c.photos + c.reports + c.places;

export const BADGES: BadgeDef[] = [
  {
    key: "first-review",
    label: "Premier avis",
    description: "Un avis publié",
    icon: "star",
    goal: 1,
    count: (c) => c.reviews,
  },
  {
    key: "critic",
    label: "Critique local",
    description: "10 avis publiés",
    icon: "star",
    goal: 10,
    count: (c) => c.reviews,
  },
  {
    key: "first-photo",
    label: "Œil de Boyoma",
    description: "Une photo publiée",
    icon: "camera",
    goal: 1,
    count: (c) => c.photos,
  },
  {
    key: "photographer",
    label: "Photographe du quartier",
    description: "10 photos publiées",
    icon: "camera",
    goal: 10,
    count: (c) => c.photos,
  },
  {
    key: "guardian",
    label: "Gardien des fiches",
    description: "Un signalement d'erreur traité",
    icon: "shield",
    goal: 1,
    count: (c) => c.reports,
  },
  {
    key: "scout",
    label: "Éclaireur",
    description: "Un établissement ajouté et validé",
    icon: "map",
    goal: 1,
    count: (c) => c.places,
  },
  {
    key: "pillar",
    label: "Pilier de Boyoma",
    description: "25 contributions validées",
    icon: "trophy",
    goal: 25,
    count: total,
  },
];

export interface BadgeProgress {
  def: BadgeDef;
  value: number;
  earned: boolean;
}

export function badgeProgress(c: Contributions): BadgeProgress[] {
  return BADGES.map((def) => {
    const value = def.count(c);
    return { def, value: Math.min(value, def.goal), earned: value >= def.goal };
  });
}
