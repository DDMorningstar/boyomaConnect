import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import {
  getCurrentPermissions,
  getCurrentProfile,
  getCurrentRoles,
  requireUser,
} from "@/features/auth/session";

/** Permissions donnant accès à la console (au moins une). */
const ADMIN_PERMISSIONS = [
  "submissions.review",
  "claims.review",
  "reports.handle",
  "reviews.moderate",
  "media.moderate",
  "places.read_all",
  "places.edit_any",
  "users.read",
  "categories.manage",
  "audit.read",
  "settings.manage",
  "analytics.read",
  "imports.view",
];

export interface AdminContext {
  userId: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  roles: Set<string>;
  can: (permission: string) => boolean;
}

/** Exige un compte de l'équipe ; sinon renvoie vers la connexion ou l'accueil. */
export const requireAdmin = cache(async (path = "/admin"): Promise<AdminContext> => {
  const user = await requireUser(path);
  const [perms, roles, profile] = await Promise.all([
    getCurrentPermissions(),
    getCurrentRoles(),
    getCurrentProfile(),
  ]);
  if (!ADMIN_PERMISSIONS.some((p) => perms.has(p)) || profile?.status === "suspended") redirect("/");
  return {
    userId: user.id,
    email: user.email ?? null,
    name: profile?.display_name ?? null,
    avatar: profile?.avatar_url ?? null,
    roles,
    can: (p) => perms.has(p),
  };
});

/** Exige une permission précise pour un module (sinon retour au tableau de bord). */
export async function requirePermission(permission: string, path: string) {
  const ctx = await requireAdmin(path);
  if (!ctx.can(permission)) redirect("/admin");
  return ctx;
}
