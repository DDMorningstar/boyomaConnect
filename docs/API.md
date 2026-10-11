# API (fonctions RPC Supabase)

Appel : `supabase.rpc(nom, params)`. Toutes paramétrées (aucun SQL dynamique).

## Publiques (anon + authenticated)
| Fonction | Rôle |
|---|---|
| `search_places(p_query, p_category_slug, p_unit_id, p_latitude, p_longitude, p_radius_m, p_price_max, p_open_now, p_verified_only, p_sort, p_limit≤50, p_offset)` | Recherche plein texte + trigrammes (fautes de frappe, accents), filtres cumulables, tri relevance/distance/recent/rating/name, `total_count` |
| `places_in_bbox(min_lng, min_lat, max_lng, max_lat, p_category_slug, p_query, p_limit≤1000)` | Points de la zone visible de la carte (zone ≤ 5°) |
| `search_suggestions(p_query, p_limit)` | Suggestions lieux / catégories / communes |
| `category_place_counts()`, `unit_place_counts(parent_id)` | Comptages réels pour l'accueil |
| `popular_places(p_days, p_limit)` | Classement transparent : vues + 2×(appels+WhatsApp) + 3×itinéraires |
| `resolve_place_slug(slug)` | Redirection d'anciens slugs |
| `is_place_open_at(place_id, at, tz)` | Ouvert / fermé / NULL si horaires inconnus |
| `place_public_reviews(place_id, limit, offset)` | Avis publiés avec nom public |
| `record_place_event(place_id, type, session_hash)` | Statistiques réelles, dédupliquées 30 min |
| `log_search(query, results, filters)` | Analytique anonyme (position supprimée) |
| `popular_searches(limit)` | Recherches fréquentes (≥ 3 occurrences) |
| `report_place(place_id, reason, details, fingerprint)` | Signalement (5/heure) |
| `active_sponsored_places(placement, category, limit)`, `record_campaign_event(...)` | Publicité identifiée |
| `place_active_plan(place_id)`, `place_has_feature(place_id, feature)` | Droits liés aux plans |

## Authentifiées (permissions vérifiées dans la fonction)
| Fonction | Permission |
|---|---|
| `find_duplicate_places(name, lat, lng, radius, unit, limit)` | RLS |
| `review_place_submission(id, decision, notes, duplicate_of, publish)` | `submissions.review`, jamais sa propre soumission |
| `review_place_claim(id, decision, notes)` | `claims.review`, jamais sa propre demande |
| `review_place_revision(id, decision, notes)` | `places.edit_any` ou `submissions.review` |
| `start_subscription_checkout(place_id, plan_key, provider, idempotency_key)` | gestionnaire du lieu |
| `confirm_manual_payment(payment_id, reference, note)` | `billing.manage`, pas l'initiateur |
| `simulate_payment_confirmation(payment_id)` | uniquement si `billing.simulated_payments_enabled = true` |
| `current_user_permissions()`, `current_user_roles()` | soi-même |
