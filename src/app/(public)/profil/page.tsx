import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, KeyRound, LogOut, ShieldCheck, Store, UserRound } from "lucide-react";
import { InfoPage } from "@/components/ui/info-page";
import { Button, ButtonLink } from "@/components/ui/button";
import { getCurrentPermissions, getCurrentProfile, getCurrentUser } from "@/features/auth/session";
import { signOut } from "@/features/auth/actions";
import { ThemeSelector } from "@/components/layout/theme-toggle";
import { LanguageSelector } from "@/components/layout/language-selector";
import { ContributorBadges } from "@/components/community/contributor-badges";
import { getMyContributions } from "@/features/community/queries";
import { PrivacySettings } from "./privacy-settings";
import { ProfileForms } from "./profile-forms";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <InfoPage title="Compte">
        <div className="border-line bg-surface space-y-3 rounded-[var(--radius-card)] border p-4">
          <p className="flex items-start gap-3 text-sm">
            <UserRound className="text-brand mt-0.5 size-5 shrink-0" aria-hidden="true" />
            Connectez-vous (Google ou e-mail) pour gérer la fiche de votre établissement, votre catalogue et
            vos photos. La consultation reste possible sans compte.
          </p>
          <ButtonLink href="/connexion?next=/profil">Se connecter</ButtonLink>
        </div>
        <h2>Apparence</h2>
        <ThemeSelector />
        <h2>Langue · Monoko · Lugha</h2>
        <LanguageSelector />
        <h2>Confidentialité sur cet appareil</h2>
        <PrivacySettings />
      </InfoPage>
    );
  }

  const [profile, permissions, contributions] = await Promise.all([
    getCurrentProfile(),
    getCurrentPermissions(),
    getMyContributions(),
  ]);
  const canModerate = permissions.has("submissions.review") || permissions.has("claims.review");
  const row =
    "border-line bg-surface hover:bg-surface-2 flex items-center gap-3 rounded-2xl border p-4 font-semibold";

  return (
    <InfoPage title="Mon compte" intro={user.email ?? undefined}>
      {profile?.status === "suspended" && (
        <p role="alert" className="bg-danger/10 text-danger rounded-2xl p-3 text-sm">
          Votre compte est suspendu : vous pouvez consulter le site mais pas modifier de fiche.
        </p>
      )}
      <ProfileForms name={profile?.display_name ?? null} avatar={profile?.avatar_url ?? null} />

      {contributions && <ContributorBadges contributions={contributions} />}

      <nav aria-label="Espaces" className="space-y-2">
        <Link href="/espace-pro" className={row}>
          <Store className="text-brand size-5" aria-hidden="true" />
          <span className="flex-1">Espace professionnel</span>
          <ChevronRight className="text-muted size-5" aria-hidden="true" />
        </Link>
        <Link href="/profil/mot-de-passe" className={row}>
          <KeyRound className="text-brand size-5" aria-hidden="true" />
          <span className="flex-1">Mot de passe</span>
          <ChevronRight className="text-muted size-5" aria-hidden="true" />
        </Link>
        {canModerate && (
          <Link href="/admin" className={row}>
            <ShieldCheck className="text-brand size-5" aria-hidden="true" />
            <span className="flex-1">Console d&apos;administration</span>
            <ChevronRight className="text-muted size-5" aria-hidden="true" />
          </Link>
        )}
      </nav>

      <form action={signOut}>
        <Button type="submit" variant="secondary">
          <LogOut className="size-4" aria-hidden="true" /> Se déconnecter
        </Button>
      </form>

      <h2>Apparence</h2>
      <ThemeSelector />

      <h2>Langue · Monoko · Lugha</h2>
      <LanguageSelector />

      <h2>Confidentialité sur cet appareil</h2>
      <PrivacySettings />
    </InfoPage>
  );
}
