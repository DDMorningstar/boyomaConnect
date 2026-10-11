import { z } from "zod";

/** Variables publiques (exposées au navigateur). Validées au démarrage. */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_MAP_STYLE_URL: z.string().url().default("https://tiles.openfreemap.org/styles/liberty"),
  NEXT_PUBLIC_ROUTING_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// Accès explicite : Next.js ne remplace que les références littérales process.env.NEXT_PUBLIC_*.
const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL || undefined,
  NEXT_PUBLIC_ROUTING_URL: process.env.NEXT_PUBLIC_ROUTING_URL,
});

if (!parsed.success) {
  throw new Error(
    "Configuration invalide : vérifiez .env.local (voir .env.example). " +
      parsed.error.issues.map((i) => i.path.join(".")).join(", "),
  );
}

export const env = parsed.data;
