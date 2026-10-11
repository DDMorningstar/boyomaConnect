# Avancement — mis à jour le 11/10/2026

## Réellement exécuté et vérifié

- Projet Supabase `boyoma-connect` créé (plan gratuit, eu-west-3).
- 9 migrations appliquées sans erreur : extensions/PostGIS, identité & permissions, géographie (Tshopo,
  Kisangani, 6 communes), catégories (12 + 72), établissements, interactions, collecte & workflows,
  commerce/tourisme/paramètres/stockage, fonctions de recherche.
- Test SQL (transaction annulée) : recherche texte, tolérance aux fautes, filtre catégorie+ville avec
  descendants, rayon, distance (8 220 m, cohérent), bbox, suggestions ; RLS visiteur (lieux publiés seuls,
  pas de profils, insertion et paiement refusés).
- Fonctions utilitaires (`src/lib/format.ts`) exécutées : toutes les assertions passent ; haversine 8 231 m.

- 11/10/2026 (Windows, Node 24) : `npm install`, typecheck, lint, `format:check`, Vitest (16 tests) et
  `next build` (23 routes) passent. Corrections : typage des RPC adapté à supabase-js 2.117
  (`.returns<T[]>()` retiré), `@supabase/ssr` 0.6 → 0.12, formatage Prettier, `.gitattributes` (LF).
- Test fumée `next start` : `/`, `/categories`, `/recherche`, `/carte`, `/sitemap.xml` → 200 avec la base réelle.

- 11/10/2026 : dépôt GitHub `DDMorningstar/boyomaConnect` ; projet Vercel `del-hiver/boyoma-connect` (Hobby)
  relié à `main`, variables `NEXT_PUBLIC_*` définies (Production/Preview/Development), déployé sur
  https://boyoma-connect.vercel.app. Pages principales, sitemap, robots, manifeste et `sw.js` → 200 ;
  rendu mobile de l'accueil vérifié ; carte : style OpenFreeMap et RPC `places_in_bbox` chargés.

- 11/10/2026 : carte invisible corrigée (conteneur de hauteur nulle : `maplibre-gl.css` hors `@layer`
  l'emportait sur `absolute inset-0` de Tailwind v4) ; vérifié en production (fond de carte affiché).
- 11/10/2026 : 167 lieux réels importés d'OpenStreetMap (migration `place_external_refs`, script
  `scripts/osm-import.mjs`) : publiés, non vérifiés, provenance + attribution ODbL sur la fiche ; contrôles SQL :
  167 refs, 0 lieu sans catégorie, recherche « hotel » → 9, « pharmacie » → 2, bbox centre → 146.

## Problèmes connus

- `/lieux/<slug inexistant>` affiche la page « introuvable » mais avec le code HTTP 200 (streaming dû à
  `loading.tsx`) ; à corriger pour le SEO.
- Playwright (E2E) pas encore exécuté.

## Non testé

- Rendu visuel réel, Lighthouse, Web Vitals (aucune mesure effectuée).
- Carte (dépend du fournisseur de tuiles), géolocalisation, installation PWA, Service Worker.
- RLS pour les rôles connectés (nécessite des comptes de test — phase 4).

## Blocages / actions humaines

- Lieux importés d'OSM à vérifier sur le terrain (catégorie, activité, commune) ; aucun horaire ni commune
  renseignés. Limites des communes à obtenir (source et licence compatibles) pour les rattacher.
- Coordonnées de support, textes légaux définitifs : à fournir.
- Secrets GitHub Actions (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) à ajouter,
  sinon le build de la CI échoue.
- Plan Vercel Hobby : usage non commercial uniquement.

## Prochaine étape

1. Phase 4 : authentification (connexion, inscription, middleware de session, pages protégées).
