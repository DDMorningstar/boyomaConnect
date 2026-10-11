import Link from "next/link";

export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563EB" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="#0B1736" />
      <path
        d="M24 9c-6.6 0-12 5.2-12 11.7C12 29.5 24 40 24 40s12-10.5 12-19.3C36 14.2 30.6 9 24 9Z"
        fill="url(#bc-g)"
      />
      <circle cx="24" cy="21" r="4.6" fill="#0B1736" />
    </svg>
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
