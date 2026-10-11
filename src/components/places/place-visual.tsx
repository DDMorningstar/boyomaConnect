import Image from "next/image";
import { CategoryBadge, CategoryIcon } from "@/components/places/category-icon";

/**
 * Logo utilisé comme couverture : le logo, net et centré, sur un fond flouté tiré du logo lui-même.
 * Rend les fiches gérées par leur établissement plus identifiables et plus homogènes.
 */
export function LogoCover({
  logo,
  name,
  size,
  priority = false,
}: {
  logo: string;
  name: string;
  size: "sm" | "md" | "lg";
  priority?: boolean;
}) {
  const box = {
    sm: "size-16 rounded-2xl",
    md: "size-24 rounded-3xl",
    lg: "size-32 md:size-40 rounded-[2rem]",
  }[size];
  return (
    <div className="bg-night relative h-full w-full overflow-hidden">
      <Image
        src={logo}
        alt=""
        fill
        // Fond flouté : une petite image suffit, le flou masque la faible résolution.
        sizes="64px"
        priority={priority}
        className="scale-125 object-cover opacity-70 blur-2xl saturate-150"
        aria-hidden="true"
      />
      <div className="from-night/10 to-night/50 absolute inset-0 bg-gradient-to-b" aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={`${box} relative overflow-hidden bg-white shadow-[0_12px_40px_rgb(0_0_0/0.35)] ring-4 ring-white/80`}
        >
          <Image
            src={logo}
            alt={`Logo de ${name}`}
            fill
            sizes={{ sm: "64px", md: "96px", lg: "160px" }[size]}
            priority={priority}
            className="object-cover"
          />
        </div>
      </div>
    </div>
  );
}

/** Visuel d'une carte de lieu : logo, sinon photo, sinon icône de catégorie (jamais d'image inventée). */
export function PlaceThumb({
  logo,
  cover,
  name,
  icon,
  color,
  variant,
}: {
  logo: string | null;
  cover: string | null;
  name: string;
  icon?: string | null;
  color?: string | null;
  variant: "tile" | "row";
}) {
  if (variant === "tile") {
    if (logo) return <LogoCover logo={logo} name={name} size="sm" />;
    if (cover) {
      return (
        <Image
          src={cover}
          alt=""
          fill
          sizes="256px"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      );
    }
    return (
      <div className="flex h-full items-center justify-center">
        <CategoryBadge icon={icon} color={color} size="lg" />
      </div>
    );
  }
  const src = logo ?? cover;
  if (!src) return <CategoryBadge icon={icon} color={color} size="lg" />;
  return (
    <div
      className={`bg-surface-2 relative size-20 shrink-0 overflow-hidden rounded-2xl ${logo ? "ring-line ring-1" : ""}`}
    >
      <Image src={src} alt={logo ? `Logo de ${name}` : ""} fill sizes="80px" className="object-cover" />
    </div>
  );
}

/** Couverture sans image : dégradé de marque et icône de catégorie. */
export function IconCover({ icon }: { icon?: string | null }) {
  return (
    <div className="from-night to-brand flex h-full w-full items-center justify-center bg-gradient-to-br">
      <CategoryIcon name={icon} className="size-14 text-white/80" strokeWidth={1.5} />
    </div>
  );
}
