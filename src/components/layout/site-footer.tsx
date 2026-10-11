import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-line hidden border-t md:block">
      <div className="text-muted mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm">
        <p>© {new Date().getFullYear()} Boyoma Connect · Kisangani, Tshopo, RDC</p>
        <nav className="flex gap-4" aria-label="Liens légaux">
          <Link href="/aide" className="hover:text-ink">
            Aide
          </Link>
          <Link href="/confidentialite" className="hover:text-ink">
            Confidentialité
          </Link>
          <Link href="/conditions" className="hover:text-ink">
            Conditions
          </Link>
        </nav>
        <p className="w-full text-xs">
          Cartes : données © contributeurs OpenStreetMap. Les distances affichées sont calculées à vol
          d&apos;oiseau.
        </p>
      </div>
    </footer>
  );
}
