"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn, Plus } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { NotificationBell } from "@/components/layout/notification-bell";
import { PUBLIC_NAV } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface Account {
  name: string | null;
  avatar: string | null;
}

/** Compte connecté (session locale + profil, protégé par la RLS) pour l'en-tête ; null si visiteur. */
function useAccount() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    async function load(userId: string | undefined) {
      if (!userId) return active && setAccount(null);
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (active) setAccount({ name: data?.display_name ?? null, avatar: data?.avatar_url ?? null });
    }
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => load(session?.user.id));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return account;
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const account = useAccount();
  return (
    <header className="border-line/70 bg-bg/80 sticky top-0 z-30 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />
        <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
          {PUBLIC_NAV.filter((n) => n.href !== "/profil").map(({ href, label, match }) => (
            <Link
              key={href}
              href={href}
              aria-current={match(pathname) ? "page" : undefined}
              className={`relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                match(pathname) ? "bg-brand/10 text-brand" : "text-muted hover:text-ink hover:bg-surface-2"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {account && <NotificationBell />}
          {account ? (
            <Link
              href="/profil"
              aria-label="Mon compte"
              className="hover:ring-brand/40 hidden rounded-full ring-2 ring-transparent transition md:block"
            >
              <Avatar src={account.avatar} name={account.name} size={40} />
            </Link>
          ) : account === null ? (
            <Link
              href={`/connexion?next=${encodeURIComponent(pathname)}`}
              className="border-line bg-surface hover:bg-surface-2 hidden min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold md:inline-flex"
            >
              <LogIn className="size-4" aria-hidden="true" /> Se connecter
            </Link>
          ) : null}
          <Link
            href="/ajouter-un-lieu"
            className="bg-night dark:bg-brand inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:scale-95"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ajouter un lieu</span>
            <span className="sr-only sm:hidden">Ajouter un lieu</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
