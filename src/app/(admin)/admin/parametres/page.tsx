import { Card, CardHeader, PageHeader } from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { listSettings } from "@/features/admin/queries";
import { SettingRow } from "./setting-row";

export const metadata = { title: "Paramètres" };

const GROUPS: Record<string, string> = {
  app: "Application",
  features: "Fonctionnalités",
  moderation: "Modération",
  billing: "Facturation",
  maps: "Cartographie",
  legal: "Mentions légales",
};

export default async function SettingsAdmin() {
  await requirePermission("settings.manage", "/admin/parametres");
  const settings = await listSettings();
  const groups = new Map<string, typeof settings>();
  for (const s of settings) {
    const g = s.key.split(".")[0] ?? s.key;
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }

  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Configuration de l'application. Chaque modification est enregistrée dans le journal d'audit (ancienne et nouvelle valeur). Aucun secret n'est stocké ici."
      />
      <div className="space-y-6">
        {[...groups.entries()].map(([g, list]) => (
          <Card key={g}>
            <CardHeader title={GROUPS[g] ?? g} />
            <div className="divide-line divide-y">
              {list.map((s) => (
                <SettingRow key={s.key} setting={s} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
