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

## Connexion Google (Supabase Auth)

1. Google Cloud Console → API et services → Écran de consentement OAuth (type « Externe », nom
   « Boyoma Connect ») puis Identifiants → Créer un ID client OAuth → « Application Web » :
   - Origines JavaScript autorisées : `https://boyoma-connect.vercel.app`, `http://localhost:3000`
   - URI de redirection autorisés : `https://fhqgohyfjeymvomkeqlf.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Sign In / Providers → Google : activer, coller l'ID client et le code
   secret (le secret reste dans Supabase, jamais dans le dépôt ni dans Vercel).
3. Supabase → Authentication → URL Configuration : Site URL `https://boyoma-connect.vercel.app` ;
   Redirect URLs : `https://boyoma-connect.vercel.app/auth/callback`, `http://localhost:3000/auth/callback`,
   `https://boyoma-connect-*-del-hiver.vercel.app/auth/callback` (préversions).
4. E-mail + mot de passe (déjà activé dans Supabase, confirmation d'adresse obligatoire) : sans SMTP
   personnalisé, Supabase n'envoie les e-mails qu'aux membres de l'équipe du projet, avec un quota très bas.
   Avant d'ouvrir l'inscription au public : Supabase → Authentication → Emails → SMTP Settings (ex. Resend,
   Brevo), expéditeur `no-reply@<votre-domaine>` ; traduire les modèles « Confirm signup » et
   « Reset password » en français. Les liens reviennent sur `/auth/callback` (déjà autorisé ci-dessus).
5. Premier administrateur : après sa première connexion, lui attribuer le rôle `admin` en SQL
   (`insert into public.user_roles (user_id, role_key) values ('<uuid>', 'admin')`). Un administrateur ne
   peut pas valider ses propres demandes : tester avec un second compte Google.

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
