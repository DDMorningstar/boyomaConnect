import { env } from "@/lib/env";

/** URL publique d'un fichier du bucket « place-media » (null si pas d'image). */
export function placeMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const clean = path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/place-media/${clean}`;
}
