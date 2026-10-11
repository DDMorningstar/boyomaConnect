"use client";
import { startTransition, useActionState, useState } from "react";
import { Loader2, Settings2, X } from "lucide-react";
import { DecisionButtons } from "@/components/admin/action-form";
import { adminSetRole, adminSetUserStatus, type ReviewState } from "@/features/admin/actions";

const ASSIGNABLE: { key: string; label: string; help: string; superOnly?: boolean }[] = [
  { key: "moderator", label: "Modérateur", help: "Valide fiches, avis, photos et signalements." },
  { key: "field_agent", label: "Agent cartographe", help: "Collecte des lieux sur le terrain." },
  {
    key: "admin",
    label: "Administrateur",
    help: "Tous les droits sauf la gestion des super-admins.",
    superOnly: true,
  },
  {
    key: "super_admin",
    label: "Super-administrateur",
    help: "Tous les droits, y compris nommer des admins.",
    superOnly: true,
  },
];

function RoleToggle({
  userId,
  role,
  has,
  disabled,
}: {
  userId: string;
  role: (typeof ASSIGNABLE)[number];
  has: boolean;
  disabled: boolean;
}) {
  const [state, dispatch, pending] = useActionState<ReviewState, FormData>(adminSetRole, null);
  const [checked, setChecked] = useState(has);
  return (
    <li className="flex items-start gap-3 py-2.5">
      <label className="flex flex-1 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled || pending}
          onChange={(e) => {
            const grant = e.target.checked;
            setChecked(grant);
            const f = new FormData();
            f.set("user_id", userId);
            f.set("role", role.key);
            f.set("grant", String(grant));
            startTransition(() => dispatch(f));
          }}
          className="accent-brand mt-1 size-4"
        />
        <span>
          <span className="block text-sm font-semibold">{role.label}</span>
          <span className="text-muted block text-xs">{role.help}</span>
        </span>
      </label>
      {pending && <Loader2 className="text-muted size-4 animate-spin" />}
      {state?.error && <span className="text-danger max-w-40 text-xs">{state.error}</span>}
    </li>
  );
}

/** Panneau de gestion d'un compte : rôles et suspension. */
export function UserManager({
  user,
  isSelf,
  isSuperAdmin,
  canRoles,
  canStatus,
}: {
  user: { id: string; email: string; name: string | null; roles: string[]; status: "active" | "suspended" };
  isSelf: boolean;
  isSuperAdmin: boolean;
  canRoles: boolean;
  canStatus: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canRoles && !canStatus) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line bg-surface hover:bg-surface-2 inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold"
      >
        <Settings2 className="size-3.5" /> Gérer
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={`Gérer ${user.email}`}
        >
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="motion-safe:animate-fade-in absolute inset-0 bg-black/40"
          />
          <aside className="bg-surface relative flex h-full w-full max-w-md flex-col shadow-2xl motion-safe:animate-[slide-in-right_0.25s_ease-out]">
            <header className="border-line flex items-center justify-between border-b px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-bold">{user.name ?? user.email}</p>
                <p className="text-muted truncate text-xs">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="hover:bg-surface-2 rounded-full p-2"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {canRoles && (
                <section>
                  <h3 className="mb-1 font-bold">Rôles</h3>
                  <p className="text-muted mb-2 text-xs">
                    Chaque changement est appliqué immédiatement et tracé dans le journal.
                  </p>
                  <ul className="divide-line divide-y">
                    {ASSIGNABLE.map((r) => (
                      <RoleToggle
                        key={r.key}
                        userId={user.id}
                        role={r}
                        has={user.roles.includes(r.key)}
                        disabled={(r.superOnly && !isSuperAdmin) || (isSelf && r.key === "super_admin")}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {canStatus && !isSelf && (
                <section>
                  <h3 className="mb-1 font-bold">Compte</h3>
                  <p className="text-muted mb-3 text-sm">
                    {user.status === "suspended"
                      ? "Ce compte est suspendu : il peut consulter le site mais plus rien modifier."
                      : "Suspendre empêche toute modification (fiches, avis, photos) sans supprimer le compte."}
                  </p>
                  <DecisionButtons
                    action={adminSetUserStatus}
                    hidden={{ user_id: user.id }}
                    field="status"
                    reasonName="reason"
                    reasonPlaceholder="Motif de la suspension"
                    choices={
                      user.status === "suspended"
                        ? [{ value: "active", label: "Réactiver le compte", tone: "primary" }]
                        : [
                            {
                              value: "suspended",
                              label: "Suspendre le compte",
                              tone: "danger",
                              needsReason: true,
                            },
                          ]
                    }
                  />
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
