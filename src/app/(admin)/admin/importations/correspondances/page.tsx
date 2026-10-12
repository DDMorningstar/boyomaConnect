import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardHeader, PageHeader, tableCls } from "@/components/admin/ui";
import { DecisionButtons } from "@/components/admin/action-form";
import { requirePermission } from "@/features/admin/access";
import { toggleMapping } from "@/features/imports/actions";
import { getImportFormOptions, listMappings } from "@/features/imports/queries";
import { MappingForm } from "./mapping-form";

export const metadata = { title: "Correspondances OSM" };

export default async function MappingsPage() {
  const ctx = await requirePermission("imports.view", "/admin/importations/correspondances");
  const canManage = ctx.can("imports.manage");
  const [rows, options] = await Promise.all([listMappings(), getImportFormOptions()]);
  const active = rows.filter((r) => r.is_active).length;

  return (
    <>
      <Link
        href="/admin/importations"
        className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Importations
      </Link>
      <PageHeader
        title="Correspondances OpenStreetMap"
        description={`Étiquettes OSM associées aux catégories de Boyoma Connect (${active} actives sur ${rows.length}). Un lieu dont aucune étiquette ne correspond est mis en quarantaine.`}
      />
      {canManage && (
        <Card className="mb-6">
          <CardHeader title="Ajouter ou modifier une correspondance" />
          <div className="p-5">
            <MappingForm groups={options.groups} />
          </div>
        </Card>
      )}
      <Card>
        <div className={tableCls.wrap}>
          <table className={tableCls.table}>
            <thead>
              <tr>
                <th className={tableCls.th}>Étiquette OSM</th>
                <th className={tableCls.th}>Condition</th>
                <th className={tableCls.th}>Catégorie Boyoma</th>
                <th className={`${tableCls.th} text-right`}>Priorité</th>
                <th className={tableCls.th}>État</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`${tableCls.tr} ${r.is_active ? "" : "opacity-60"}`}>
                  <td className={`${tableCls.td} font-mono text-xs`}>
                    {r.osm_key}={r.osm_value}
                  </td>
                  <td className={`${tableCls.td} text-muted font-mono text-xs`}>
                    {r.condition_key ? `${r.condition_key}=${r.condition_value}` : "—"}
                  </td>
                  <td className={tableCls.td}>{r.category?.name ?? "—"}</td>
                  <td className={`${tableCls.td} text-right tabular-nums`}>{r.priority}</td>
                  <td className={tableCls.td}>
                    {canManage ? (
                      <DecisionButtons
                        action={toggleMapping}
                        hidden={{ id: r.id }}
                        compact
                        choices={[
                          r.is_active
                            ? { value: "off", label: "Désactiver", tone: "neutral" }
                            : { value: "on", label: "Activer", tone: "primary" },
                        ]}
                      />
                    ) : (
                      <span className="text-muted text-xs">{r.is_active ? "Active" : "Inactive"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
