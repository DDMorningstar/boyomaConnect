import { ISSUE_LABELS, type IssueCode } from "@/features/imports/types";

const badge = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

const BATCH: Record<string, { label: string; cls: string }> = {
  staging: { label: "Préparation", cls: "bg-surface-2 text-muted" },
  ready: { label: "À contrôler", cls: "bg-warning/12 text-warning" },
  importing: { label: "Import en cours", cls: "bg-brand/12 text-brand" },
  completed: { label: "Terminé", cls: "bg-success/12 text-success" },
  failed: { label: "Interrompu", cls: "bg-danger/12 text-danger" },
  cancelled: { label: "Annulé", cls: "bg-surface-2 text-muted" },
};

export const ITEM_STATUS: Record<string, { label: string; cls: string; hint: string }> = {
  ready: { label: "Prêt", cls: "bg-brand/12 text-brand", hint: "Sera créé à l'import" },
  existing: {
    label: "Existant",
    cls: "bg-cyan/12 text-cyan",
    hint: "Même identifiant source : actualisation si la fiche n'est ni gérée ni vérifiée",
  },
  duplicate: {
    label: "Doublon",
    cls: "bg-violet-500/12 text-violet-500",
    hint: "Lieu proche au nom similaire : ignoré",
  },
  quarantined: { label: "Quarantaine", cls: "bg-warning/12 text-warning", hint: "À vérifier avant import" },
  rejected: { label: "Rejeté", cls: "bg-danger/12 text-danger", hint: "Non importable" },
  imported: { label: "Créé", cls: "bg-success/12 text-success", hint: "Lieu créé" },
  updated: { label: "Actualisé", cls: "bg-success/12 text-success", hint: "Lieu existant mis à jour" },
  skipped: { label: "Ignoré", cls: "bg-surface-2 text-muted", hint: "Non modifié" },
};

export const ORIGIN: Record<string, string> = {
  overpass: "Recherche OSM",
  upload: "Fichier",
  sync: "Synchronisation",
};

export function BatchStatusBadge({ status }: { status: string }) {
  const s = BATCH[status] ?? { label: status, cls: "bg-surface-2 text-muted" };
  return <span className={`${badge} ${s.cls}`}>{s.label}</span>;
}

export function ItemStatusBadge({ status }: { status: string }) {
  const s = ITEM_STATUS[status] ?? { label: status, cls: "bg-surface-2 text-muted", hint: "" };
  return (
    <span className={`${badge} ${s.cls}`} title={s.hint}>
      {s.label}
    </span>
  );
}

export function IssueChips({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {issues.map((code) => {
        const i = ISSUE_LABELS[code as IssueCode];
        const tone =
          i?.severity === "reject"
            ? "bg-danger/10 text-danger"
            : i?.severity === "quarantine"
              ? "bg-warning/10 text-warning"
              : "bg-surface-2 text-muted";
        return (
          <li key={code} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
            {i?.label ?? code}
          </li>
        );
      })}
    </ul>
  );
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-CD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lubumbashi",
  }).format(new Date(iso));
}
