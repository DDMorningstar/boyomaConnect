# CLAUDE.md — règles permanentes du projet Boyoma Connect

## Produit

PWA d'annuaire et de découverte urbaine pour Kisangani (Tshopo, RDC), extensible à la RDC.
Langue : français (sw, ln, en prévus). Devises : USD + CDF. Fuseau : Africa/Lubumbashi.

## Règles absolues

- Ne jamais inventer d'établissements, adresses, numéros, horaires, prix ou coordonnées GPS.
  Données de démonstration : uniquement préfixées `[FICTIF]`, jamais publiées en production.
- Aucune clé secrète dans le navigateur ni dans Git. Seules les variables `NEXT_PUBLIC_*` sont publiques.
- Aucun bouton factice : une action non disponible est désactivée et expliquée.
- Distance à vol d'oiseau ≠ distance routière ; ne jamais inventer un temps de trajet.
- Aucun paiement confirmé par un simple clic (webhook signé, validation manuelle auditée, ou « simulated » en dev).
- Contenus sponsorisés toujours marqués « Sponsorisé » ; jamais de pertinence achetée dans les résultats naturels.
- Ne jamais supprimer tables/colonnes/fonctionnalités pour contourner une erreur. Archiver plutôt que supprimer.
- Ne pas déclarer une fonctionnalité terminée sans l'avoir testée ; tenir `docs/PROGRESS.md` à jour.
- Respecter les licences cartographiques ; pas de téléchargement massif de tuiles OSM.

## Stack

Next.js App Router + TypeScript strict + Tailwind v4 · Supabase (Postgres, PostGIS dans le schéma `gis`,
Auth, Storage, RLS) · MapLibre GL · Vitest · Playwright · npm (gestionnaire unique).

## Conventions

- Accès aux données serveur : `src/features/*/queries.ts` (server-only). RPC SQL pour la recherche.
- Fonctions SQL : `set search_path = ''`, noms qualifiés (`public.`, `gis.`, `extensions.`).
- Écritures sensibles : fonctions `SECURITY DEFINER` qui vérifient `has_permission()` et écrivent dans `audit_logs`.
- Les triggers garde-fous (`*_guard`) n'acceptent les écritures internes que si `boyoma.internal_write = on`
  est positionné par une fonction de confiance.
- Migrations : `supabase/migrations/AAAAMMJJHHMMSS_nom.sql`, jamais modifiées une fois en production.
- Mobile-first ; états chargement / erreur / vide / hors ligne obligatoires ; respecter `prefers-reduced-motion`.
