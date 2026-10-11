import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { InfoPage } from "@/components/ui/info-page";
import { getCurrentPermissions, requireUser } from "@/features/auth/session";
import { getModerationQueue } from "@/features/admin/moderation";
import { formatCoordinates, formatDate } from "@/lib/format";
import { placeMediaUrl } from "@/lib/supabase/storage";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Modération", robots: { index: false } };

const ROLE: Record<string, string> = {
  owner: "Propriétaire",
  manager: "Gérant(e)",
  employee: "Employé(e)",
  other: "Autre",
};

export default async function AdminPage() {
  const user = await requireUser("/admin");
  const perms = await getCurrentPermissions();
  if (!perms.has("submissions.review") && !perms.has("claims.review")) redirect("/profil");
  const { submissions, claims, names } = await getModerationQueue();
  const card = "border-line bg-surface space-y-3 rounded-[var(--radius-card)] border p-4";

  return (
    <InfoPage
      title="Modération"
      intro="Vérifiez chaque demande (appel au numéro fourni, visite si besoin) avant de valider."
    >
      <h2>Nouvelles fiches ({submissions.length})</h2>
      {submissions.length === 0 && <p className="text-muted text-sm">Aucune fiche en attente.</p>}
      {submissions.map((s) => (
        <article key={s.id} className={card}>
          <header className="flex items-start gap-3">
            {s.logo_path && (
              <Image
                src={placeMediaUrl(s.logo_path)!}
                alt="Logo"
                width={48}
                height={48}
                className="rounded-xl object-cover"
              />
            )}
            <div className="min-w-0">
              <h3 className="font-bold">{s.name}</h3>
              <p className="text-muted text-sm">
                {s.category?.name ?? "Sans catégorie"} · {s.unit?.name ?? "Commune inconnue"} · par{" "}
                {names.get(s.submitted_by) ?? "utilisateur"} le {formatDate(s.created_at)}
                {s.owner_request && " · demande propriétaire"}
              </p>
            </div>
          </header>
          {s.short_description && <p className="text-sm">{s.short_description}</p>}
          <ul className="text-sm">
            {s.contacts.map((c) => (
              <li key={`${c.kind}-${c.value}`} className="flex items-center gap-1.5">
                {c.kind === "phone" && <Phone className="size-4" aria-hidden="true" />}
                <span className="text-muted">{c.kind} :</span> {c.value}
              </li>
            ))}
            {(s.address_text || s.landmark_description) && (
              <li className="flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden="true" />
                {[s.address_text, s.landmark_description].filter(Boolean).join(" — ")}
              </li>
            )}
            {s.latitude != null && s.longitude != null && (
              <li>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline"
                >
                  {formatCoordinates(s.latitude, s.longitude)}
                </a>{" "}
                {s.gps_accuracy_m != null && `(± ${Math.round(s.gps_accuracy_m)} m)`}
              </li>
            )}
          </ul>
          {s.photo_paths.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {s.photo_paths.map((p) => (
                <Image
                  key={p}
                  src={placeMediaUrl(p)!}
                  alt="Photo proposée"
                  width={128}
                  height={96}
                  className="h-24 w-32 rounded-xl object-cover"
                />
              ))}
            </div>
          )}
          {s.submitted_by === user.id ? (
            <p className="bg-surface-2 rounded-xl p-3 text-sm">
              Votre propre demande : elle doit être validée par un autre administrateur.
            </p>
          ) : (
            <ReviewForm id={s.id} kind="submission" />
          )}
        </article>
      ))}

      <h2>Réclamations de fiches ({claims.length})</h2>
      {claims.length === 0 && <p className="text-muted text-sm">Aucune réclamation en attente.</p>}
      {claims.map((c) => (
        <article key={c.id} className={card}>
          <h3 className="font-bold">
            {c.place ? <Link href={`/lieux/${c.place.slug}`}>{c.place.name}</Link> : "Fiche"}
          </h3>
          <p className="text-muted text-sm">
            {names.get(c.claimant_id) ?? "Utilisateur"} · {ROLE[c.claimant_role] ?? c.claimant_role} · le{" "}
            {formatDate(c.created_at)}
          </p>
          <p className="text-sm">
            Téléphone : {c.contact_phone ?? "—"} · E-mail : {c.contact_email ?? "—"}
          </p>
          {c.message && <p className="bg-surface-2 rounded-xl p-3 text-sm">{c.message}</p>}
          {c.claimant_id === user.id ? (
            <p className="bg-surface-2 rounded-xl p-3 text-sm">
              Votre propre demande : elle doit être validée par un autre administrateur.
            </p>
          ) : (
            <ReviewForm id={c.id} kind="claim" />
          )}
        </article>
      ))}
    </InfoPage>
  );
}
