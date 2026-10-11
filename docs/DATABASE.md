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
4 plans (0/3/10/25 USD), paramètres applicatifs. **Aucun établissement.**

## Fonctions RPC

Voir `API.md`.

## Tests

`supabase/tests/rls_and_search_smoke.sql` — exécuté le 11/10/2026, résultat :
`texte=2 typo=2 cat+ville=2 rayon1km=1 dist_lointaine_m=8220 bbox=1 suggestions=3 anon_voit=2 anon_profiles=0 anon_insert=refusé anon_paiement=refusé`.
