import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { getImportFormOptions, getImportSources } from "@/features/imports/queries";
import { FileForm, OverpassForm, ScheduleForm } from "./import-forms";

export const metadata = { title: "Nouvelle importation" };

export default async function NewImportPage() {
  await requirePermission("imports.manage", "/admin/importations/nouvelle");
  const [{ groups, zones }, sources] = await Promise.all([getImportFormOptions(), getImportSources()]);
  const osm = sources.find((s) => s.key === "osm");

  return (
    <>
      <Link
        href="/admin/importations"
        className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Importations
      </Link>
      <PageHeader
        title="Nouvelle importation"
        description="Chaque importation crée un lot : lecture, normalisation, détection des doublons et des fiches suspectes, puis prévisualisation. Les lieux ne sont créés qu'après votre confirmation."
      />
      <div className="bg-success/8 border-success/20 mb-6 flex gap-3 rounded-2xl border p-4 text-sm">
        <ShieldCheck className="text-success size-5 shrink-0" aria-hidden="true" />
        <p>
          Sources légalement réutilisables uniquement : OpenStreetMap (ODbL) et données ouvertes à licence
          déclarée. L&apos;extraction de Google Maps (outils de « scraping ») est exclue : ses conditions
          d&apos;utilisation l&apos;interdisent et ses données ne peuvent pas être rediffusées.
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Rechercher dans OpenStreetMap" />
          <div className="p-5">
            {osm?.is_active && osm.api_url ? (
              <OverpassForm zones={zones} groups={groups} cooldown={osm.min_request_interval_seconds} />
            ) : (
              <p className="text-muted text-sm">
                La source OpenStreetMap est désactivée (voir Sources et licences).
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Importer un fichier" />
          <div className="p-5">
            <FileForm zones={zones} sources={sources} />
          </div>
        </Card>

        <Card>
          <div id="synchronisation" className="scroll-mt-24">
            <CardHeader title="Programmer une synchronisation" />
          </div>
          <div className="p-5">
            {osm?.is_active && osm.api_url ? (
              <ScheduleForm zones={zones} groups={groups} minHours={osm.min_sync_interval_hours} />
            ) : (
              <p className="text-muted text-sm">Aucune source synchronisable active.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
