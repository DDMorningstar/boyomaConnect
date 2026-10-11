# Déploiement

## Environnements

| Env                    | Front                                                | Base                                                     |
| ---------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Local                  | `npm run dev`                                        | projet Supabase `boyoma-connect` (ou Supabase CLI local) |
| Preview/test           | Vercel (Hobby : **usage non commercial uniquement**) | Supabase                                                 |
| Production commerciale | Vercel Pro ou VPS Hostinger (Node standalone/Docker) | Supabase Pro ou PostgreSQL+PostGIS                       |

## Variables (Vercel → Settings → Environment Variables)

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_MAP_STYLE_URL`, `NEXT_PUBLIC_ROUTING_URL` (facultatif). `SUPABASE_SECRET_KEY` seulement en
Production et seulement quand les webhooks de paiement existeront ; ne pas l'exposer aux Previews.

## GitHub + Vercel (actions manuelles)

1. `git init && git add . && git commit -m "init"`, créer le dépôt GitHub, `git push`.
2. Vercel → Add New Project → importer le dépôt → renseigner les variables → Deploy.
3. Supabase → Authentication → URL Configuration : ajouter l'URL Vercel (phase 4).
4. GitHub → Settings → Secrets : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (CI).

## Migrations

Appliquées via le connecteur Supabase le 11/10/2026 (les versions enregistrées dans
`supabase_migrations.schema_migrations` portent l'horodatage d'application, pas celui des fichiers).
Avant d'utiliser la Supabase CLI sur ce projet : `supabase link --project-ref fhqgohyfjeymvomkeqlf`,
puis `supabase migration list` et, si besoin, `supabase migration repair` pour aligner l'historique.
Nouvelle base vierge : `supabase db push` applique les 9 fichiers dans l'ordre.

## Sauvegarde / restauration

- Supabase Free : pas de sauvegarde automatique restaurable → `supabase db dump -f backup.sql` (planifier).
- Supabase Pro : sauvegardes quotidiennes + PITR en option.
- Restauration : `psql "$DATABASE_URL" -f backup.sql` sur une base avec PostGIS installé dans le schéma `gis`.
- Storage : exporter les buckets (`supabase storage cp -r`).

## Migration vers VPS Hostinger

1. `BUILD_STANDALONE=1 npm run build` → `.next/standalone` + `.next/static` + `public`.
2. Lancer `node server.js` derrière Nginx (HTTPS Let's Encrypt), PM2 ou Docker.
3. Base : rester sur Supabase, ou PostgreSQL 15+ avec PostGIS (`create extension postgis with schema gis`),
   rejouer les migrations ; les dépendances à `auth.users`/`storage` nécessitent Supabase auto-hébergé ou une adaptation.
