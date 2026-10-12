import { z } from "zod";

const SORTS = ["relevance", "distance", "recent", "rating", "name"] as const;
export type SearchSort = (typeof SORTS)[number];

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Validation des paramètres d'URL de /recherche (entrées non fiables). */
export const searchParamsSchema = z.object({
  q: optionalString(120),
  categorie: optionalString(80)
    .refine((v) => !v || /^[a-z0-9-]+$/.test(v), "slug invalide")
    .catch(undefined),
  commune: z.string().uuid().optional().catch(undefined),
  /** Zone (province, ville ou territoire) : slug ; à défaut, zone mémorisée puis Kisangani. */
  zone: optionalString(60)
    .refine((v) => !v || /^[a-z0-9-]+$/.test(v), "slug invalide")
    .catch(undefined),
  tri: z.enum(SORTS).catch("relevance").default("relevance"),
  page: z.coerce.number().int().min(1).max(200).catch(1).default(1),
  lat: z.coerce.number().min(-90).max(90).optional().catch(undefined),
  lng: z.coerce.number().min(-180).max(180).optional().catch(undefined),
  ouvert: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "1"),
  verifie: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "1"),
});

export type ParsedSearch = z.infer<typeof searchParamsSchema>;

export function parseSearchParams(raw: Record<string, string | string[] | undefined>): ParsedSearch {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const result = searchParamsSchema.safeParse(flat);
  if (result.success) {
    // Le tri par distance exige une position.
    if (result.data.tri === "distance" && (result.data.lat == null || result.data.lng == null)) {
      return { ...result.data, tri: "relevance" };
    }
    return result.data;
  }
  return searchParamsSchema.parse({});
}

export const PAGE_SIZE = 20;
