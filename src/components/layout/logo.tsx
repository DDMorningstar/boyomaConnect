import Image from "next/image";
import Link from "next/link";

/** Pictogramme officiel (épingle connectée), généré par scripts/generate-brand.mjs. */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <Image
      src="/brand/emblem-192.webp"
      alt=""
      aria-hidden="true"
      width={96}
      height={96}
      priority
      className={`${className} shrink-0 rounded-xl object-cover`}
    />
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Boyoma Connect — accueil">
      <LogoMark />
      <span className="leading-none">
        <span className="block text-[15px] font-extrabold tracking-tight">
          Boyoma <span className="text-brand">Connect</span>
        </span>
        <span className="text-muted hidden text-[11px] sm:block">
          Votre ville. Vos adresses. Votre chemin.
        </span>
      </span>
    </Link>
  );
}
