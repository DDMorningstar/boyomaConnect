import { Camera, Lock, MapPinPlus, ShieldCheck, Star, Trophy } from "lucide-react";
import { badgeProgress, total, type BadgeIcon, type Contributions } from "@/features/community/badges";

const ICONS: Record<BadgeIcon, typeof Star> = {
  star: Star,
  camera: Camera,
  shield: ShieldCheck,
  map: MapPinPlus,
  trophy: Trophy,
};

/** Badges gagnés (en couleur) et à débloquer (grisés, avec la progression). */
export function ContributorBadges({ contributions }: { contributions: Contributions }) {
  const items = badgeProgress(contributions);
  const earned = items.filter((b) => b.earned).length;
  const n = total(contributions);
  return (
    <section aria-labelledby="badges-titre" className="space-y-3">
      <div>
        <h2 id="badges-titre" className="!mt-0">
          Mes badges de contributeur
        </h2>
        <p className="text-muted text-sm">
          {n === 0
            ? "Donnez un avis, proposez une photo ou signalez une erreur : chaque contribution validée aide toute la ville."
            : `${n} contribution${n > 1 ? "s" : ""} validée${n > 1 ? "s" : ""} · ${earned} badge${earned > 1 ? "s" : ""} sur ${items.length}. Merci !`}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map(({ def, value, earned: ok }) => {
          const Icon = ICONS[def.icon];
          return (
            <li
              key={def.key}
              className={`flex items-start gap-2.5 rounded-2xl border p-3 ${
                ok ? "border-brand/30 bg-brand/5" : "border-line bg-surface"
              }`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full ${
                  ok ? "bg-brand text-white" : "bg-surface-2 text-muted"
                }`}
              >
                {ok ? <Icon className="size-4" aria-hidden="true" /> : <Lock className="size-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${ok ? "" : "text-muted"}`}>{def.label}</span>
                <span className="text-muted block text-xs">
                  {ok ? def.description : `${def.description} · ${value}/${def.goal}`}
                </span>
                <span className="sr-only">{ok ? "Badge obtenu" : "Badge à débloquer"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
