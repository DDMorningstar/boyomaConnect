import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/features/admin/access";
import { getQueueCounts } from "@/features/admin/queries";
import { getBusinessQueueCounts } from "@/features/admin/business";
import { getCurrentPermissions } from "@/features/auth/session";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s · Administration Boyoma" },
  robots: { index: false, follow: false },
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super-administrateur",
  admin: "Administrateur",
  moderator: "Modérateur",
};

/** Console d'administration : mise en page indépendante du site public. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdmin("/admin");
  const [perms, queue, business] = await Promise.all([
    getCurrentPermissions(),
    getQueueCounts(),
    getBusinessQueueCounts(),
  ]);
  const counts = { ...queue, ...business };
  const role = ["super_admin", "admin", "moderator"].find((r) => ctx.roles.has(r));
  return (
    <AdminShell
      permissions={[...perms]}
      counts={counts}
      user={{
        name: ctx.name,
        email: ctx.email,
        avatar: ctx.avatar,
        role: (role && ROLE_LABEL[role]) || "Équipe",
      }}
    >
      {children}
    </AdminShell>
  );
}
