# API (fonctions RPC Supabase)

Appel : `supabase.rpc(nom, params)`. Toutes paramétrées (aucun SQL dynamique).

## Publiques (anon + authenticated)

| Fonction                                                                                                                                                          | Rôle                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_places(p_query, p_category_slug, p_unit_id, p_latitude, p_longitude, p_radius_m, p_price_max, p_open_now, p_verified_only, p_sort, p_limit≤50, p_offset)` | Recherche plein texte + trigrammes (fautes de frappe, accents), filtres cumulables, tri relevance/distance/recent/rating/name, `total_count` |
| `places_in_bbox(min_lng, min_lat, max_lng, max_lat, p_category_slug, p_query, p_limit≤1000)`                                                                      | Points de la zone visible de la carte (emprise ≤ 12°, pour afficher toute la province)                                                       |
| `search_suggestions(p_query, p_limit)`                                                                                                                            | Suggestions lieux / catégories / communes (`unit`) / province, ville, territoires (`zone`)                                                   |
| `category_place_counts(p_unit_id?)`, `unit_place_counts(parent_id)`                                                                                               | Comptages réels (dans une zone si `p_unit_id`, descendants compris)                                                                          |
| `popular_places(p_days, p_limit, p_unit_id?)`                                                                                                                     | Classement transparent : vues + 2×(appels+WhatsApp) + 3×itinéraires, filtrable par zone                                                      |
| `locate_unit(lat, lng)`                                                                                                                                           | Unité la plus précise contenant un point (limites RGC/OCHA)                                                                                  |
| `resolve_place_slug(slug)`                                                                                                                                        | Redirection d'anciens slugs                                                                                                                  |
| `is_place_open_at(place_id, at, tz)`                                                                                                                              | Ouvert / fermé / NULL si horaires inconnus                                                                                                   |
| `place_public_reviews(place_id, limit, offset)`                                                                                                                   | Avis publiés avec nom public                                                                                                                 |
| `record_place_event(place_id, type, session_hash)`                                                                                                                | Statistiques réelles, dédupliquées 30 min                                                                                                    |
| `log_search(query, results, filters)`                                                                                                                             | Analytique anonyme (position supprimée)                                                                                                      |
| `popular_searches(limit)`                                                                                                                                         | Recherches fréquentes (≥ 3 occurrences)                                                                                                      |
| `report_place(place_id, reason, details, fingerprint)`                                                                                                            | Signalement (5/heure)                                                                                                                        |
| `active_sponsored_places(placement, category, limit)`, `record_campaign_event(...)`                                                                               | Publicité identifiée                                                                                                                         |
| `place_active_plan(place_id)`, `place_has_feature(place_id, feature)`                                                                                             | Droits liés aux plans                                                                                                                        |

## Authentifiées (permissions vérifiées dans la fonction)

| Fonction                                                                     | Permission                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `find_duplicate_places(name, lat, lng, radius, unit, limit)`                 | RLS                                                       |
| `review_place_submission(id, decision, notes, duplicate_of, publish)`        | `submissions.review`, jamais sa propre soumission         |
| `review_place_claim(id, decision, notes)`                                    | `claims.review`, jamais sa propre demande                 |
| `review_place_revision(id, decision, notes)`                                 | `places.edit_any` ou `submissions.review`                 |
| `start_subscription_checkout(place_id, plan_key, provider, idempotency_key)` | gestionnaire du lieu                                      |
| `confirm_manual_payment(payment_id, reference, note)`                        | `billing.manage`, pas l'initiateur                        |
| `simulate_payment_confirmation(payment_id)`                                  | uniquement si `billing.simulated_payments_enabled = true` |
| `current_user_permissions()`, `current_user_roles()`                         | soi-même                                                  |

## Importations (authenticated + permission `imports.manage`, SECURITY DEFINER, audit)

| Fonction                                                                    | Rôle                                                                   |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `import_reserve_request(source)`                                            | Créneau d'appel à une API publique (1 / min par défaut, partagé)       |
| `import_analyze_batch(batch)`                                               | Rattachement, zone, doublons, statuts (décisions manuelles conservées) |
| `import_decide_item(item, decision, category?, note?)`                      | accept / reject / skip / merge                                         |
| `import_commit_batch(batch, limit)`                                         | Import d'une tranche (création, actualisation, provenance) ; reprise   |
| `import_mark_failed`, `import_cancel_batch`                                 | Échec consigné / annulation                                            |
| `import_save_schedule`, `import_toggle_schedule`, `import_schedule_started` | Synchronisations (intervalle ≥ minimum de la source)                   |
| `import_save_mapping`, `import_toggle_mapping`                              | Correspondances OSM → catégories                                       |
| `unit_bbox(unit)`                                                           | Emprise d'une unité (limite, sinon centre ± 0,2°)                      |
| `osm_derived_places()` (anon)                                               | Extrait ODbL de la base dérivée d'OSM (`/api/exports/osm`)             |

## Console business (décision D32, migration `20261013120000_business_suite`)

- Public : `send_business_inquiry` (via action serveur, empreinte SHA-256 IP + navigateur, 3/h, 10/j, 2/j par
  fiche), `record_catalog_event(item, view|contact, session)`, `active_promotions(unit, place, limit)`.
- Gestionnaire : `owner_place_stats(place, 7|30|90)`, `set_inquiry_status`, `submit_promotion`,
  `invite_place_member`, `manage_place_member`, `place_members`, `my_place_invitations`,
  `respond_place_invitation`, `request_place_verification`, `submit_payment_reference`,
  `cancel_pending_subscription`, `billing_instructions`, `mark_notifications_read`.
- Équipe : `moderate_promotion` (campaigns.manage), `handle_verification_request` (places.publish),
  `confirm_manual_payment` / `reject_manual_payment` / `admin_grant_plan` (billing.manage).
- Routes : `GET /api/statut/<slug>[?article=<id>][&telecharger=1]` (PNG 1080×1920, données publiques),
  `/affiche/<slug>` (affiche A5 imprimable).
