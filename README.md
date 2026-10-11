# Boyoma Connect

**Votre ville. Vos adresses. Votre chemin.** — PWA de découverte et de localisation des lieux de Kisangani.

## Démarrage local (Windows, macOS, Linux)

Prérequis : Node.js 20.9+ (LTS 22 recommandé).

```bash
npm install
npm run dev          # http://localhost:3000
```

Le fichier `.env.local` (déjà fourni, non commité) pointe vers le projet Supabase `boyoma-connect`
avec des valeurs **publiques** uniquement. Modèle : `.env.example`.

## Vérifications

```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm test             # tests unitaires (Vitest)
npm run build        # build de production
npm run test:e2e     # tests E2E (Playwright ; première fois : npx playwright install chromium)
npm run check        # tout d'un coup (sauf E2E)
```

## Structure

```
src/app/(public)/     pages publiques (accueil, recherche, carte, fiches, catégories, communes…)
src/components/       UI, layout, places, search, map
src/features/         logique métier par domaine (places, favorites, search…)
src/lib/              env, clients Supabase, formatage, validation
supabase/migrations/  schéma SQL versionné (PostGIS, RLS, fonctions RPC)
supabase/tests/       tests SQL (RLS + recherche)
tests/unit|e2e/       Vitest / Playwright
docs/                 architecture, base, API, sécurité, déploiement, décisions, avancement
```

Documentation : voir `docs/`. État réel du projet : `docs/PROGRESS.md`.
