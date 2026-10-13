import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { requireUser } from "@/features/auth/session";
import { countNewInquiries, getConsolePlace } from "@/features/owner/business";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { placeMediaUrl } from "@/lib/supabase/storage";
import { ConsoleNav } from "./console-nav";

export const metadata: Metadata = { title: "Gérer mon établissement", robots: { index: false } };

const PLAN_LABEL: Record<string, string> = {
  free: "Gratuit",
  business: "Business",
  premium: "Premium",
  sponsor: "Sponsor",
};

/** Console « gérer son business » (décision D32) : réservée aux gestionnaires de la fiche. */
export default async function ConsoleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireUser(`/espace-pro/lieux/${id}`);
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const supabase = await createSupabaseServerClient();
  const [newInquiries, plan] = await Promise.all([
    countNewInquiries(place.id),
    supabase
      .rpc("place_active_plan", { p_place_id: place.id })
      .then((r) => (r.data as string | null) ?? "free"),
  ]);
  const base = `/espace-pro/lieux/${place.id}`;
  const verified =
    place.verification_status !== "unverified" && place.verification_status !== "community_reported";

  return (
    <div className="pt-5 pb-4">
      <Link href="/espace-pro" className="text-muted mb-3 inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" aria-hidden="true" /> Espace professionnel
      </Link>
      <header className="border-line bg-surface mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)]">
        <Avatar src={placeMediaUrl(place.logo_path)} name={place.name} size={56} rounded="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 truncate text-xl font-extrabold tracking-tight md:text-2xl">
            <span className="truncate">{place.name}</span>
            {verified && <BadgeCheck className="text-success size-5 shrink-0" aria-label="Vérifiée" />}
          </h1>
          <p className="text-muted text-sm">
            {place.primary_category?.name ?? "Établissement"} ·{" "}
            {place.my_role === "owner" ? "Propriétaire" : "Gestionnaire"} · plan{" "}
            <Link href={`${base}/abonnement`} className="text-brand font-semibold">
              {PLAN_LABEL[plan] ?? plan}
            </Link>
            {place.publication_status !== "published" && " · fiche non publiée"}
          </p>
        </div>
        <Link
          href={`/lieux/${place.slug}`}
          className="border-line hover:bg-surface-2 inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold"
        >
          Voir ma fiche <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
      </header>
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <ConsoleNav base={base} newInquiries={newInquiries} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
