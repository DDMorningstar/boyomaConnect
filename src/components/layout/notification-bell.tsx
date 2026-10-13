"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Cloche des notifications (compte connecté) : nombre de non lues, rafraîchi à chaque navigation. */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let active = true;
    void getSupabaseBrowserClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .then(({ count }) => active && setUnread(count ?? 0));
    return () => {
      active = false;
    };
  }, [pathname]);
  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications : ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
      className="text-muted hover:text-ink hover:bg-surface-2 relative grid size-10 place-items-center rounded-full"
    >
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 && (
        <span className="bg-danger ring-bg absolute top-1 right-1 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-white ring-2">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
