import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
  fieldCls,
  relativeTime,
  tableCls,
} from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { PAGE_SIZE, listRoles, listUsers } from "@/features/admin/queries";
import { UserManager } from "./user-manager";

export const metadata = { title: "Utilisateurs" };

const PROVIDER: Record<string, string> = { email: "E-mail", google: "Google" };

export default async function UsersAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const ctx = await requirePermission("users.read", "/admin/utilisateurs");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, error }, roles] = await Promise.all([
    listUsers(sp.q?.slice(0, 80), sp.role || undefined, page),
    listRoles(),
  ]);
  const roleName = new Map(roles.map((r) => [r.key, r.name]));
  const qs = (p: number) =>
    `/admin/utilisateurs?${new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Comptes inscrits, rôles de l'équipe et suspensions. Les adresses e-mail ne sont visibles que par l'équipe."
      />
      <Card>
        <form className="border-line flex flex-wrap gap-2 border-b p-4" role="search">
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Rechercher</span>
            <Search
              className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Nom ou e-mail…"
              className={`${fieldCls} w-full pl-9`}
            />
          </label>
          <select name="role" defaultValue={sp.role ?? ""} className={fieldCls} aria-label="Rôle">
            <option value="">Tous les rôles</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-brand hover:bg-brand-strong rounded-xl px-4 text-sm font-semibold text-white"
          >
            Filtrer
          </button>
          {(sp.q || sp.role) && (
            <Link href="/admin/utilisateurs" className="text-muted hover:text-ink self-center px-2 text-sm">
              Réinitialiser
            </Link>
          )}
        </form>
        {error ? (
          <EmptyState title="Chargement impossible" text={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="Aucun compte trouvé" />
        ) : (
          <div className={tableCls.wrap}>
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Compte</th>
                  <th className={tableCls.th}>Rôles</th>
                  <th className={tableCls.th}>Connexion</th>
                  <th className={tableCls.th}>Statut</th>
                  <th className={tableCls.th}>Dernière visite</th>
                  <th className={tableCls.th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className={tableCls.tr}>
                    <td className={tableCls.td}>
                      <div className="flex items-center gap-3">
                        <Avatar src={u.avatar_url} name={u.display_name ?? u.email} size={36} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {u.display_name ?? "—"}
                            {u.id === ctx.userId && <span className="text-brand ml-1.5 text-xs">(vous)</span>}
                          </p>
                          <p className="text-muted truncate text-xs">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={tableCls.td}>
                      <div className="flex max-w-72 flex-wrap gap-1">
                        {u.roles
                          .filter((r) => r !== "registered_user")
                          .map((r) => (
                            <span
                              key={r}
                              className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            >
                              {roleName.get(r) ?? r}
                            </span>
                          ))}
                        {u.roles.every((r) => r === "registered_user") && (
                          <span className="text-muted text-xs">Utilisateur</span>
                        )}
                      </div>
                    </td>
                    <td className={`${tableCls.td} text-muted text-xs`}>
                      {u.providers.map((p) => PROVIDER[p] ?? p).join(" + ") || "—"}
                    </td>
                    <td className={tableCls.td}>
                      <StatusBadge
                        status={u.status === "suspended" ? "suspended" : "active"}
                        label={u.status === "suspended" ? "Suspendu" : "Actif"}
                      />
                    </td>
                    <td className={`${tableCls.td} text-muted whitespace-nowrap`}>
                      {relativeTime(u.last_sign_in_at)}
                    </td>
                    <td className={`${tableCls.td} text-right`}>
                      <UserManager
                        user={{
                          id: u.id,
                          email: u.email,
                          name: u.display_name,
                          roles: u.roles,
                          status: u.status,
                        }}
                        isSelf={u.id === ctx.userId}
                        isSuperAdmin={ctx.roles.has("super_admin")}
                        canRoles={ctx.can("roles.manage")}
                        canStatus={ctx.can("users.manage")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} href={qs} />
      </Card>
    </>
  );
}
