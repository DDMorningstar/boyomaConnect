import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="contenu" className="pb-nav mx-auto w-full max-w-6xl px-4">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
