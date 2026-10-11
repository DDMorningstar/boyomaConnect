# Architecture

## Vue d'ensemble

```
Navigateur (PWA)  ──►  Next.js (App Router, Vercel ou Node/VPS)  ──►  Supabase
  • Server Components (pages publiques, SEO)          • PostgreSQL + PostGIS (schéma gis)
  • Composants client ciblés (recherche, carte,       • RLS sur toutes les tables
    favoris, actions)                                 • Fonctions RPC (recherche, workflows)
  • Service Worker + localStorage (favoris)           • Auth, Storage (place-media, claim-evidence)
MapLibre GL ──► tuiles OpenFreeMap (configurable)     Routage externe (configurable, phase 6)
```

## Principes

- **Monolithe modulaire** : un seul déploiement Next.js, logique métier dans `src/features/*`.
  Pas de microservices ni de NestJS en phase 1.
- **La base fait autorité sur la sécurité** : RLS + fonctions `SECURITY DEFINER` contrôlant `has_permission()`.
  Le front n'utilise que la clé publique ; une clé secrète n'est jamais nécessaire pour les parcours utilisateurs.
- **Lecture côté serveur** pour les pages publiques (SEO, peu de JavaScript). **Client** uniquement pour
  l'interactif : suggestions de recherche, carte, géolocalisation, favoris, signalements, statistiques.
- **Carte isolée** (`src/components/map`) et chargée dynamiquement : le fournisseur de tuiles est une variable
  d'environnement, ce qui permettra une couverture hors ligne auto-hébergée plus tard.
- **Portabilité VPS** : `BUILD_STANDALONE=1 npm run build` produit un serveur Node autonome (Docker/Hostinger).
  Supabase peut être remplacé par Supabase auto-hébergé ou PostgreSQL + PostGIS (migrations SQL standard).

## Routage

| Groupe      | Routes                                                                                                                                                                                                                                                                            | État    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `(public)`  | `/`, `/explorer`, `/recherche`, `/carte`, `/proximite`, `/categories`, `/categories/[slug]`, `/communes/[slug]`, `/lieux/[slug]`, `/tourisme`, `/favoris`, `/profil`, `/connexion`, `/inscription`, `/ajouter-un-lieu`, `/aide`, `/confidentialite`, `/conditions`, `/hors-ligne` | livré   |
| `business/` | `/business/**`                                                                                                                                                                                                                                                                    | phase 9 |
| `terrain/`  | `/terrain/**`                                                                                                                                                                                                                                                                     | phase 7 |
| `admin/`    | `/admin/**`                                                                                                                                                                                                                                                                       | phase 8 |

## Dépendances principales

next 15, react 19, @supabase/ssr + supabase-js, maplibre-gl 5, zod, lucide-react, tailwindcss 4.
Prévues (ajoutées au moment du module concerné pour ne pas alourdir le bundle) : TanStack Query, Zustand,
React Hook Form, Motion, idb (IndexedDB) — voir `DECISIONS.md`.
