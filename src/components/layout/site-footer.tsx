import Link from "next/link";
import { Logo } from "@/components/layout/logo";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Explorer",
    links: [
      { href: "/categories", label: "Catégories" },
      { href: "/zones/tshopo", label: "Territoires de la Tshopo" },
      { href: "/carte", label: "Carte" },
      { href: "/proximite", label: "À proximité" },
      { href: "/tourisme", label: "Boyoma Explore" },
    ],
  },
  {
    title: "Professionnels",
    links: [
      { href: "/ajouter-un-lieu", label: "Ajouter mon établissement" },
      { href: "/espace-pro", label: "Espace professionnel" },
      { href: "/connexion", label: "Connexion" },
    ],
  },
  {
    title: "Informations",
    links: [
      { href: "/aide", label: "Aide" },
      { href: "/sources", label: "Sources et licences" },
      { href: "/confidentialite", label: "Confidentialité" },
      { href: "/conditions", label: "Conditions d'utilisation" },
    ],
  },
];

/** Pied de page (écrans larges ; la navigation mobile passe par la barre du bas). */
export function SiteFooter() {
  return (
    <footer className="border-line bg-surface/40 mt-16 hidden border-t md:block">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted max-w-xs text-sm">
            L&apos;annuaire des lieux de Kisangani et de la Tshopo : contacts, position, catalogue et
            itinéraire.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="space-y-3 text-sm">
            <p className="font-semibold">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted hover:text-brand transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-line text-muted mx-auto flex max-w-6xl flex-wrap justify-between gap-2 border-t px-4 py-5 text-xs">
        <p>© {new Date().getFullYear()} Boyoma Connect · Kisangani, Tshopo, RDC</p>
        <p>
          Cartes et lieux importés : données © contributeurs OpenStreetMap (ODbL). Limites administratives :
          RGC RDC (OCHA, 2019), CC BY 3.0 IGO. Distances à vol d&apos;oiseau.
        </p>
      </div>
    </footer>
  );
}
