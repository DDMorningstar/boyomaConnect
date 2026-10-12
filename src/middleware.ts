import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ZONE_COOKIE, isZoneSlug } from "@/features/zones/zones";

/**
 * Rafraîchit la session Supabase (cookies) à chaque requête de page et mémorise la zone choisie
 * (?zone=… dans l'URL). Aucune autorisation ici : chaque page et action revérifie l'utilisateur.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
  }

  // Préférence d'affichage seulement (pas une donnée personnelle) ; validée à la lecture (resolveZone).
  const zone = request.nextUrl.searchParams.get("zone");
  if (isZoneSlug(zone) && request.cookies.get(ZONE_COOKIE)?.value !== zone) {
    response.cookies.set(ZONE_COOKIE, zone, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return response;
}

export const config = {
  // Pages uniquement : ni fichiers statiques, ni images, ni service worker.
  matcher: [
    "/((?!_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico)$).*)",
  ],
};
