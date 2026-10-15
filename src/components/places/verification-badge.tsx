import { BadgeCheck, CircleDashed, ShieldCheck } from "lucide-react";
import type { VerificationStatus } from "@/types/places";

const LABELS: Record<VerificationStatus, { label: string; tone: "ok" | "info" | "muted" }> = {
  admin_verified: { label: "Vérifié par Boyoma", tone: "ok" },
  owner_verified: { label: "Confirmé par l'établissement", tone: "ok" },
  agent_verified: { label: "Vérifié sur le terrain", tone: "ok" },
  community_reported: { label: "Signalé par la communauté", tone: "info" },
  unverified: { label: "Non vérifié", tone: "muted" },
};

export function VerificationBadge({
  status,
  compact = false,
}: {
  status: VerificationStatus;
  compact?: boolean;
}) {
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

/** Fiche certifiée par Boyoma Connect (visite d'un agent ou vérification par l'équipe). */
export const isBoyomaVerified = (status?: string | null) =>
  status === "agent_verified" || status === "admin_verified";

export const VERIFIED_LABEL = "Établissement vérifié par Boyoma Connect";

/**
 * Badge de certification, à la manière des réseaux sociaux : sceau bleu et coche blanche, placé juste
 * après le nom. Réservé aux fiches vérifiées par Boyoma (terrain ou équipe), jamais déclaratif.
 */
export function VerifiedMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={VERIFIED_LABEL}
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
    >
      <title>{VERIFIED_LABEL}</title>
      <defs>
        <linearGradient id="bc-verified" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path
        fill="url(#bc-verified)"
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      />
      <path
        d="m8.5 12.2 2.4 2.4 4.6-4.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
