# Sécurité

## Contrôle d'accès

- RBAC explicite : 7 rôles stockés (+ visiteur anonyme), 26 permissions, `has_permission()` / `has_role()`
  (`SECURITY DEFINER`, `search_path` vide). Rôles cumulables.
- Accès par ressource : `place_owners` + `is_place_manager()` ; un gestionnaire ne modifie que ses lieux.
- Champs sensibles d'un lieu (nom, position, catégorie, statuts…) protégés par trigger : les gestionnaires
  passent par `place_revisions` (validation). Publication = `places.publish`, archivage = `places.archive`.
- Séparation des tâches : personne ne valide sa propre soumission, revendication, proposition ou paiement.
- Seul un super-administrateur gère les rôles admin/super_admin ; un super-admin ne peut pas se retirer son rôle.
- Modérateurs : aucune permission `billing.*`.
- Pas de `DELETE` sur les lieux (archivage). Journal `audit_logs` append-only (écriture via fonction uniquement).

## Scénarios RLS vérifiés (11/10/2026)

- Visiteur : ne lit que les lieux publiés (brouillon invisible) ; aucun profil lisible ; insertion refusée ;
  fonction de paiement refusée. Voir `supabase/tests/rls_and_search_smoke.sql`.
- À compléter en phase 4 avec des comptes de test : propriétaire, agent, modérateur, admin.

## Secrets

- Navigateur : `NEXT_PUBLIC_SUPABASE_URL` + clé **publishable** uniquement.
- `SUPABASE_SECRET_KEY` : serveur uniquement (webhooks), jamais préfixée `NEXT_PUBLIC_`, jamais commitée.
- `application_settings` refuse les clés contenant secret/password/token/private_key.

## Application

- Validation Zod des paramètres d'URL ; RPC typées ; JSON-LD échappé ; liens externes `noopener noreferrer`.
- En-têtes : nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy.
- Géolocalisation demandée uniquement sur action de l'utilisateur, jamais stockée côté serveur.
- Statistiques : identifiant aléatoire local, sans IP ni identité. `log_search` supprime toute coordonnée.
- Service Worker : ne met jamais en cache l'API Supabase ni les pages privées ; purge `CLEAR_PRIVATE` à la déconnexion.
- Uploads : buckets avec types MIME et tailles limités ; dépôts restreints au dossier de l'utilisateur ou du lieu géré.

## Risques connus / à traiter

- Photos de collecte stockées dans le bucket public sous `submissions/<uid>/` avant validation (noms aléatoires).
  Évolution prévue : bucket privé + déplacement à la validation.
- Limitation de fréquence applicative (middleware) à ajouter en phase 4 ; les RPC sensibles ont déjà des quotas SQL.
- Politique de confidentialité et CGU : brouillons à faire valider juridiquement.

## Paiements Mobile Money (Malipo, D33)

- `MALIPO_API_KEY`, `MALIPO_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` : serveur uniquement (Vercel),
  jamais `NEXT_PUBLIC_`, jamais commités ; la clé n'apparaît dans aucun journal ni message d'erreur.
- Mode et préfixe de clé contrôlés (sandbox ⇔ `sk_test_`, live ⇔ `sk_live_` + `MALIPO_LIVE_CONFIRMED=oui`).
- Webhook : corps brut, HMAC-SHA256 de `timestamp.corps`, comparaison à temps constant, fenêtre de 5 minutes ;
  les requêtes invalides ne sont pas stockées (impossible de « réserver » un identifiant d'événement).
- Écritures financières par fonctions `SECURITY DEFINER` accordées au seul rôle `service_role` ; lecture RLS
  (gestionnaires de la fiche, permission `billing.read`) ; export CSV protégé contre l'injection de formules.
