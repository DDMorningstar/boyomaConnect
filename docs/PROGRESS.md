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

- 11/10/2026 : comptes et espace propriétaire (migration `20261011170000_owner_space`) : connexion Google
  (`/connexion`, `/auth/callback`, middleware de session), compte (`/profil` : nom, photo optimisée),
  espace pro (`/espace-pro` : création de fiche avec téléphone public obligatoire, logo, 3 photos, détection
  de doublons ; réclamation ; gestion contacts, photos, logo, infos, catalogue avec prix USD/CDF),
  modération (`/admin`), fiche publique (logo, catalogue, « Réclamez cette fiche »), Open Graph
  `business.business` + image de partage générée. Vérifié : typecheck, lint, 18 tests, build (27 routes),
  balises OG et image PNG en local sur la base réelle.

- 11/10/2026 : connexion par e-mail + mot de passe ajoutée (`/connexion` onglets connexion/création,
  confirmation par e-mail avec renvoi, `/connexion/mot-de-passe-oublie`, `/profil/mot-de-passe`) ; bouton
  Google désactivé et expliqué tant que le fournisseur n'est pas activé. Vérifié : typecheck, lint, tests,
  build, rendu des pages. Non testé en réel : envoi des e-mails (SMTP personnalisé à configurer).

- 11/10/2026 : thème clair/sombre/automatique (en-tête + Compte), carte sombre, animations, version PC
  (accueil avec chiffres réels et grilles, fiche pleine largeur, en-tête avec compte, pied de page). Vérifié
  avec Playwright + Edge : captures 1440 px et 390 px en clair et sombre, aucun débordement horizontal,
  bascule/mémorisation/rechargement du thème OK, aucune erreur JS. Application Google publiée (production).

- 11/10/2026 : console d'administration `/admin` (migration `admin_console`) : tableau de bord (indicateurs,
  courbe 30 jours, files d'attente, top catégories/fiches, activité), Validations, Signalements, Avis, Photos,
  Lieux (liste filtrée + édition, publication/suspension/archivage, vérification, historique), Catégories,
  Utilisateurs (rôles, suspension), Journal d'audit, Paramètres. Vérifié : fonctions SQL avec le compte
  super-admin (transaction annulée), refus anonyme, 12 requêtes PostgREST valides, typecheck/lint/tests/build.
  Non vérifié visuellement connecté (nécessite la session de l'utilisateur).

- 12/10/2026 : élargissement à la province de la Tshopo (D29). Base : 7 territoires, limites RGC/OCHA (Kisangani,
  territoires, province = union, 200 443 km²), `locate_unit` + rattachement automatique des lieux, centres et zooms
  calculés ; vérifié (chaque territoire se localise sur lui-même, point de Kinshasa → null, 168 lieux restés à
  Kisangani). Import OSM provincial : 65 nouveaux lieux (Bafwasende 33, Basoko 10, Ubundu 10, Banalia 5, Isangi 5,
  Opala 1, Yahuma 1), 65 hors province écartés, faux « bureaux administratifs » portant un e-mail personnel exclus.
  Interface : sélecteur de zone (accueil, recherche, catégories, carte, tourisme, explorer) mémorisé par cookie,
  zone par défaut Kisangani ; pages `/zones/<slug>` ; carte cadrée par zone ; localité réelle sur les fiches, l'OG
  et le JSON-LD ; formulaire pro « commune ou territoire » validé côté serveur ; suggestions de territoires.
  Migrations `zones`, `zone_suggestions`, `zone_category_counts` (comptages sans zone identiques avant/après).
  Vérifié : typecheck, lint, 22 tests, build, pages en local (voir ci-dessous).

- 12/10/2026 : module d'importation (D30, docs/IMPORTS.md) : migrations `import_module` et `import_mappings`
  (sources, 98 correspondances OSM, lots, éléments, synchronisations, provenance étendue), console
  `/admin/importations` (recherche OSM, fichiers OSM/GeoJSON/JSON/CSV, prévisualisation, décisions, import par
  tranches avec reprise, journal, synchronisations, correspondances), page `/sources`, extrait ODbL
  `/api/exports/osm`. Vérifié : test SQL `supabase/tests/imports_smoke.sql` (transaction annulée, base intacte),
  14 tests unitaires du module, typecheck, lint, build. Non vérifié : parcours dans le navigateur connecté
  (session administrateur requise), appel Overpass depuis Vercel.

- 12/10/2026 : UI / motion : titre d'accueil qui débordait sur mobile et puce de zone active illisible
  (thème sombre) corrigés ; adresse sans répétition de la commune ; badge « Ouvert / Fermé » (horaires connus
  uniquement, `places_open_status`) ; distance à vol d'oiseau sur les cartes si la position est déjà autorisée
  (jamais de demande) ; barre d'actions fixe sur mobile (Appeler, WhatsApp, Itinéraire) ; transition carte → fiche
  (View Transitions, ≤ 900 ms d'attente, désactivée si « réduire les animations »). Vérifié : build, 36 tests,
  contrôle Playwright mobile local (aucun débordement, transition, barre fixe, 0 erreur JS).

- 13/10/2026 : catalogue enrichi (D31, migration `catalog_v2`) : espace pro (rubriques, photo par article, types de
  prix et unité, mise en avant, masquage, réordonnancement, suppression confirmée) ; fiche publique en vitrine
  (grille, filtres Produits / Services / rubriques, recherche au-delà de 8 articles, fiche article avec Appeler,
  WhatsApp et e-mail pré-remplis, lien direct `#article-<id>`). Articles masqués jamais publics (filtre de requête).
  Vérifié : garde-fous SQL (transaction annulée), requêtes validées contre l'API, 40 tests, build, contrôle
  Playwright mobile local (fiche article dans l'écran, liens d'appel et WhatsApp, Échap, lien direct, 0 erreur JS).
  Non vérifié : formulaires de l'espace pro en session connectée.

## Problèmes connus

- Limite d'Isangi : enclave autour de Yangambi dans le RGC (contour simplifié) ; les points situés dans cette
  enclave ne sont rattachés à aucun territoire (ex. « Notre Dame de Yangambi » non importé).

- `/lieux/<slug inexistant>` affiche la page « introuvable » mais avec le code HTTP 200 (streaming dû à
  `loading.tsx`) ; à corriger pour le SEO.
- Playwright (E2E) pas encore exécuté.

## Non testé

- Rendu visuel réel, Lighthouse, Web Vitals (aucune mesure effectuée).
- Carte (dépend du fournisseur de tuiles), géolocalisation, installation PWA, Service Worker.
- Parcours connecté complet (connexion Google réelle, création, validation, gestion, envoi d'images) :
  dépend de l'activation du fournisseur Google dans Supabase (voir DEPLOYMENT.md).

## Blocages / actions humaines

- Lieux importés d'OSM à vérifier sur le terrain (catégorie, activité, commune) ; aucun horaire ni commune
  renseignés. Limites des communes à obtenir (source et licence compatibles) pour les rattacher.
- Coordonnées de support, textes légaux définitifs : à fournir.
- Secrets GitHub Actions (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) à ajouter,
  sinon le build de la CI échoue.
- Plan Vercel Hobby : usage non commercial uniquement.

## Prochaine étape

1. Activer Google dans Supabase, tester le parcours complet avec deux comptes (propriétaire + admin).
2. Favoris synchronisés au compte, avis ; correction du code 404 des fiches inexistantes.
