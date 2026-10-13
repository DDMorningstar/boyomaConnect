import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { requireUser } from "@/features/auth/session";
import { getNotifications } from "@/features/owner/business";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("fr-CD", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lubumbashi",
  }).format(new Date(iso));

/** Notifications du compte : demandes reçues, avis, invitations, paiements, vérifications… */
export default async function NotificationsPage() {
  await requireUser("/notifications");
  const items = await getNotifications(60);
  // Consulter la liste marque les notifications comme lues (les pastilles restent visibles pour cette vue).
  if (items.some((n) => !n.read_at)) {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("mark_notifications_read", { p_ids: null });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-6 pb-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
      {items.length === 0 ? (
        <div className="border-line text-muted flex flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center text-sm">
          <Bell className="size-6" aria-hidden="true" />
          Aucune notification pour l&apos;instant.
        </div>
      ) : (
        <ul className="border-line bg-surface divide-line divide-y overflow-hidden rounded-[var(--radius-card)] border">
          {items.map((n) => {
            const body = (
              <>
                {!n.read_at && (
                  <span className="bg-brand mt-2 size-2 shrink-0 rounded-full" aria-label="Non lue" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</p>
                  {n.body && <p className="text-muted line-clamp-2 text-sm">{n.body}</p>}
                  <p className="text-muted mt-0.5 text-xs">{fmt(n.created_at)}</p>
                </div>
              </>
            );
            // Liens internes uniquement (jamais de redirection vers un site externe).
            const href = n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? n.link : null;
            return (
              <li key={n.id} className={n.read_at ? "" : "bg-brand/5"}>
                {href ? (
                  <Link href={href} className="hover:bg-surface-2 flex items-start gap-3 p-4">
                    {body}
                    <ChevronRight className="text-muted mt-1 size-4 shrink-0" aria-hidden="true" />
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 p-4">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
