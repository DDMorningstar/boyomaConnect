import Link from "next/link";
import { ChevronRight, MapPinned, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { CategoryIcon } from "@/components/places/category-icon";
import {
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
  fieldCls,
  relativeTime,
  tableCls,
} from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { PAGE_SIZE, getGeoOptions, listPlaces } from "@/features/admin/queries";
import { placeMediaUrl } from "@/lib/supabase/storage";

export const metadata = { title: "Lieux" };

type Search = {
  q?: string;
  statut?: string;
  verification?: string;
  categorie?: string;
  source?: string;
  page?: string;
};

export default async function PlacesAdmin({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("places.read_all", "/admin/lieux");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, error }, geo] = await Promise.all([
    listPlaces({
      q: sp.q?.slice(0, 80),
      statut: sp.statut,
      verification: sp.verification,
      categorie: sp.categorie,
      source: sp.source,
      page,
    }),
    getGeoOptions(),
  ]);
  const qs = (p: number) => {
    const u = new URLSearchParams(
      Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][],
    );
    return `/admin/lieux?${u}`;
  };
  const select = `${fieldCls} pr-8`;

  return (
    <>
      <PageHeader
        title="Lieux"
        description="Tous les établissements de l'annuaire : recherche, filtres, édition, publication, vérification."
      />
      <Card>
        <form className="border-line flex flex-wrap gap-2 border-b p-4" role="search">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Rechercher un lieu</span>
            <Search
              className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Nom du lieu…"
              className={`${fieldCls} w-full pl-9`}
            />
          </label>
          <select name="statut" defaultValue={sp.statut ?? ""} className={select} aria-label="Statut">
            <option value="">Tous les statuts</option>
            <option value="published">Publiées</option>
            <option value="suspended">Suspendues</option>
            <option value="archived">Archivées</option>
            <option value="draft">Brouillons</option>
          </select>
          <select
            name="verification"
            defaultValue={sp.verification ?? ""}
            className={select}
            aria-label="Vérification"
          >
            <option value="">Vérification : toutes</option>
            <option value="verifie">Vérifiées</option>
            <option value="non-verifie">Non vérifiées</option>
          </select>
          <select name="source" defaultValue={sp.source ?? ""} className={select} aria-label="Source">
            <option value="">Toutes les sources</option>
            <option value="osm">Importées (OSM)</option>
            <option value="proprietaire">Gérées par l&apos;établissement</option>
          </select>
          <select
            name="categorie"
            defaultValue={sp.categorie ?? ""}
            className={select}
            aria-label="Catégorie"
          >
            <option value="">Toutes les catégories</option>
            {geo.groups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.children.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="submit"
            className="bg-brand hover:bg-brand-strong rounded-xl px-4 text-sm font-semibold text-white"
          >
            Filtrer
          </button>
          {Object.values(sp).some(Boolean) && (
            <Link href="/admin/lieux" className="text-muted hover:text-ink self-center px-2 text-sm">
              Réinitialiser
            </Link>
          )}
        </form>

        {error ? (
          <EmptyState title="Chargement impossible" text={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={MapPinned}
            title="Aucun lieu ne correspond"
            text="Modifiez les filtres ou la recherche."
          />
        ) : (
          <div className={tableCls.wrap}>
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Lieu</th>
                  <th className={tableCls.th}>Statut</th>
                  <th className={tableCls.th}>Vérification</th>
                  <th className={tableCls.th}>Source</th>
                  <th className={tableCls.th}>Mise à jour</th>
                  <th className={tableCls.th}>
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={tableCls.tr}>
                    <td className={tableCls.td}>
                      <Link href={`/admin/lieux/${p.id}`} className="flex items-center gap-3">
                        {p.logo_path ? (
                          <Avatar src={placeMediaUrl(p.logo_path)} name={p.name} size={36} rounded="xl" />
                        ) : (
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                            style={{
                              background: `${p.primary_category?.color ?? "#2563EB"}1f`,
                              color: p.primary_category?.color,
                            }}
                          >
                            <CategoryIcon name={p.primary_category?.icon} className="size-4" />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="hover:text-brand block truncate font-semibold">{p.name}</span>
                          <span className="text-muted block truncate text-xs">
                            {p.primary_category?.name ?? "Sans catégorie"}
                            {p.unit?.type_key === "commune" ? ` · ${p.unit.name}` : ""}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className={tableCls.td}>
                      <StatusBadge status={p.publication_status} />
                    </td>
                    <td className={tableCls.td}>
                      <StatusBadge status={p.verification_status} />
                    </td>
                    <td className={tableCls.td}>
                      {p.ownership_status === "claimed" ? (
                        <StatusBadge status="claimed" />
                      ) : p.place_external_refs.length ? (
                        <span className="text-muted text-xs font-medium">OpenStreetMap</span>
                      ) : (
                        <span className="text-muted text-xs">Saisie</span>
                      )}
                    </td>
                    <td className={`${tableCls.td} text-muted whitespace-nowrap`}>
                      {relativeTime(p.updated_at)}
                    </td>
                    <td className={`${tableCls.td} text-right`}>
                      <Link
                        href={`/admin/lieux/${p.id}`}
                        aria-label={`Ouvrir ${p.name}`}
                        className="text-muted hover:text-brand inline-flex"
                      >
                        <ChevronRight className="size-5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} href={qs} />
      </Card>
    </>
  );
}
