import Image from "next/image";

/** Photo de profil ou logo ; initiales sur fond de marque si aucune image. */
export function Avatar({
  src,
  name,
  size = 48,
  rounded = "full",
}: {
  src: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  rounded?: "full" | "xl";
}) {
  const initials =
    (name ?? "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const shape = rounded === "full" ? "rounded-full" : "rounded-2xl";
  return src ? (
    <Image
      src={src}
      alt={name ? `Photo de ${name}` : "Photo de profil"}
      width={size}
      height={size}
      className={`${shape} bg-surface-2 shrink-0 object-cover`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${shape} bg-brand/15 text-brand flex shrink-0 items-center justify-center font-bold`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
