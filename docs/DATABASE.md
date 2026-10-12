# Base de données

Projet Supabase : `boyoma-connect` (réf. `fhqgohyfjeymvomkeqlf`, région eu-west-3).
Migrations : `supabase/migrations/` (9 fichiers, tous appliqués le 11/10/2026).

## Schémas et extensions

- `gis` : PostGIS 3.3 (schéma dédié). `extensions` : pg_trgm, unaccent, pgcrypto.
- `public.normalize_text()` : minuscules + sans accents (immutable), utilisée par les index et la recherche.

## Domaines

| Domaine      | Tables                                                                                                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité     | profiles, roles, permissions, role_permissions, user_roles, audit_logs                                                                                                                                                                                            |
| Géographie   | countries, geographic_unit_types, geographic_units (hiérarchie libre, `ancestors[]`), local_landmarks, geographic_boundaries                                                                                                                                      |
| Catégories   | categories (2 niveaux, illimitées)                                                                                                                                                                                                                                |
| Lieux        | places, place_categories, place_media, place_contacts, place_hours, place_special_hours, place_services, place_amenities, place_amenity_links, place_owners, place_claims, place_revisions, place_history, place_verifications, place_reports, place_slug_history |
| Interactions | favorite_lists, favorites, reviews, review_reports, moderation_actions, activity_events, place_metrics_daily, search_analytics                                                                                                                                    |
| Collecte     | collection_assignments, place_submissions, validation_history, sync_operations                                                                                                                                                                                    |
| Commerce     | application_settings, plans, plan_features, subscriptions, subscription_history, invoices, payments, payment_events, promotions, advertising_campaigns, campaign_events, catalog_items, business_inquiries                                                        |
| Tourisme     | tourism_routes, tourism_route_stops, tourism_content                                                                                                                                                                                                              |
| Divers       | notifications ; Storage : buckets `place-media` (public), `claim-evidence` (privé)                                                                                                                                                                                |

## Points clés de `places`

- `location geography(Point,4326)` **générée** depuis `(longitude, latitude)` → aucune inversion possible.
- Coordonnées facultatives (jamais inventées) ; `geographic_precision` obligatoire ; contraintes de bornes.
- `slug` unique et stable ; ancien slug conservé dans `place_slug_history` (redirection 301).
- `search_vector` (pondéré : nom A, catégories/description courte B, repère/adresse C, description D).
- Index : GiST (location + partiel publiés), GIN trigrammes (nom), GIN tsvector, statuts, dates, FK.
- Publication exige catégorie principale + (commune ou position).

## Données initiales (réelles)

RDC → Tshopo → Kisangani (centre indicatif 0.5153 N, 25.1910 E pour la carte) → 6 communes (Makiso, Mangobo,
Tshopo, Kabondo, Kisangani, Lubunga) sans coordonnées inventées. 12 catégories, 72 sous-catégories, 12 équipements,
4 plans (0/3/10/25 USD), paramètres applicatifs. Aucun établissement dans les migrations.

## Comptes et espace propriétaire (migration `20261011170000`)

- `handle_new_user` reprend nom et photo fournis par Google ; bucket public `avatars` (`<uid>/…`).
- `place_submissions.owner_request` + `logo_path` : téléphone public obligatoire, 3 photos max (contraintes) ;
  à la validation (`review_place_submission`), le trigger `place_submissions_owner_approval` crée le lien
  `place_owners`, le rôle `place_owner`, le logo et `ownership_status = claimed`.
- `place_media_limit` : limite de photos du plan (`gallery_photos`, 3 en gratuit) ; photos d'un gestionnaire
  publiées directement. `place_contacts_keep_phone` : une fiche gérée garde au moins un téléphone.
- Catalogue (`catalog_items`) ouvert au plan gratuit.

## Lieux importés (OpenStreetMap)

- `place_external_refs` (migration `20261011150000`) : source, identifiant d'origine (`node/123`), licence,
  attribution, URL. Clé `(source, external_id)` → réimport sans doublon. Attribution affichée sur la fiche.
- `scripts/osm-import.mjs` génère le SQL (Overpass, bbox de Kisangani, correspondance étiquettes OSM →
  catégories, dédoublonnage nom + 500 m, corrections manuelles `OVERRIDES`). À exécuter avec un rôle de service.
- Lieux importés : `unverified`, `coordinates_source = imported`, précision `exact` (point) ou `approximate`
  (centre d'un bâtiment), rattachés à la **ville** (pas de limites de communes en base), horaires non repris.
- Licence ODbL 1.0 : attribution « © Contributeurs OpenStreetMap » obligatoire ; une base dérivée diffusée
  publiquement doit rester sous ODbL (voir DECISIONS.md D17).

## Province de la Tshopo (migration `20261011210000`, décision D29)

- 7 territoires (Bafwasende, Banalia, Basoko, Isangi, Opala, Ubundu, Yahuma) sous la province, à côté de la
  ville de Kisangani. Les slugs `tshopo` et `kisangani` existent aussi comme communes : toujours filtrer par `type_key`.
- `geographic_boundaries` : limites de Kisangani et des 7 territoires (RGC OCHA 2019 via geoBoundaries, CC BY 3.0 IGO,
  simplifiées ~450 m) + province = union (200 443 km²). Chargées par `supabase/seeds/limites-tshopo.sql`
  (régénérable : `node scripts/boundaries-import.mjs <geoBoundaries-COD-ADM2_simplified.geojson> <dossier>`).
- `locate_unit(lat, lng)` : unité la plus profonde contenant le point. Trigger `places_zz_assign_unit` : complète ou
  précise le rattachement d'un lieu d'après sa position, sans jamais contredire une commune choisie.
- `refresh_unit_centers()` : centre (point intérieur) et zoom de chaque unité à partir de sa limite, si absents.
- Vérifié le 12/10/2026 : chaque territoire se localise sur lui-même, un point de Kinshasa → null, les 168 lieux
  géolocalisés restent rattachés à Kisangani.

## Fonctions RPC

Voir `API.md`.

## Tests

`supabase/tests/rls_and_search_smoke.sql` — exécuté le 11/10/2026, résultat :
`texte=2 typo=2 cat+ville=2 rayon1km=1 dist_lointaine_m=8220 bbox=1 suggestions=3 anon_voit=2 anon_profiles=0 anon_insert=refusé anon_paiement=refusé`.
