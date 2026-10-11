import { BadgeCheck, CircleDashed, ShieldCheck } from "lucide-react";
import type { VerificationStatus } from "@/types/places";

const LABELS: Record<VerificationStatus, { label: string; tone: "ok" | "info" | "muted" }> = {
  admin_verified: { label: "Vérifié par Boyoma", tone: "ok" },
  owner_verified: { label: "Confirmé par l'établissement", tone: "ok" },
  agent_verified: { label: "Vérifié sur le terrain", tone: "ok" },
  community_reported: { label: "Signalé par la communauté", tone: "info" },
  unverified: { label: "Non vérifié", tone: "muted" },
};

export function VerificationBadge({ status, compact = false }: { status: VerificationStatus; compact?: boolean }) {
  const { label, tone } = LABELS[status];
  const Icon = tone === "ok" ? (status === "agent_verified" ? ShieldCheck : BadgeCheck) : CircleDashed;
  const cls =
    tone === "ok"
      ? "text-success bg-success/10"
      : tone === "info"
        ? "text-brand bg-brand/10"
        : "text-muted bg-surface-2";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
      title={label}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {compact && tone !== "muted" ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
