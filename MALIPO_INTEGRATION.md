# Intégration Malipo (Mobile Money) — Boyoma Connect

Encaissement des abonnements par **Vodacom M-Pesa**, **Orange Money** et **Airtel Money** via la passerelle
[Malipo](https://docs.malipo.dev/fr/). Décision **D33** (voir `docs/DECISIONS.md`).

> État actuel : le code est déployé mais **inactif** tant que les variables ci-dessous ne sont pas
> renseignées sur Vercel. Les utilisateurs voient « Paiement Mobile Money bientôt disponible ».
> Aucun paiement réel n'est possible sans votre autorisation explicite (mode live verrouillé).

---

## 1. Ce qui a été construit

| Élément                                                                                            | Emplacement                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Migrations (fournisseur `malipo`, table `malipo_charges`, machine d'états, webhooks, rattachement) | `supabase/migrations/20261013150000_malipo_provider.sql`, `…150100_malipo_payments.sql`, `…150200_malipo_bind.sql`                  |
| Configuration et garde-fous (mode, préfixe de clé, live confirmé)                                  | `src/features/payments/malipo/config.ts`                                                                                            |
| Client HTTP (`POST /v1/charges`, `GET /v1/charges/{id}`, `Idempotency-Key`)                        | `src/features/payments/malipo/client.ts`                                                                                            |
| Vérification de signature des webhooks                                                             | `src/features/payments/malipo/signature.ts`                                                                                         |
| Logique (création, rapprochement, webhooks)                                                        | `src/features/payments/malipo/service.ts`, `server.ts`                                                                              |
| Actions serveur (payer, actualiser)                                                                | `src/features/payments/malipo/actions.ts`                                                                                           |
| Webhook                                                                                            | `src/app/api/webhooks/malipo/route.ts` → `POST /api/webhooks/malipo`                                                                |
| Rapprochement planifié (quotidien)                                                                 | `src/app/api/cron/malipo-reconcile/route.ts` + `vercel.json`                                                                        |
| Interface de paiement (opérateur, numéro, attente, succès, échec)                                  | `src/app/(public)/espace-pro/lieux/[id]/abonnement/`                                                                                |
| Preuve de paiement imprimable                                                                      | `…/abonnement/recu/[paymentId]`                                                                                                     |
| Administration « Paiements Mobile Money » (indicateurs, filtres, export CSV, rapprochement)        | `/admin/paiements`, `src/app/api/admin/paiements/route.ts`                                                                          |
| Tests                                                                                              | `tests/unit/malipo.test.ts` (45 tests), `supabase/tests/malipo_smoke.sql` (18 contrôles en base), `scripts/malipo-sandbox-test.mjs` |

### Parcours

1. Le propriétaire choisit un plan (Abonnement → « Payer par Mobile Money »), son opérateur et son numéro.
2. Le serveur vérifie la session et le rôle, lit le **tarif en base** (jamais le navigateur), crée ou réutilise la
   facture, enregistre une tentative avec une **clé d'idempotence** unique, puis appelle `POST /v1/charges`.
   Un double clic ou un rechargement renvoie la tentative en cours (aucun second débit).
3. L'écran d'attente indique l'opérateur et le numéro masqué ; le statut est actualisé toutes les 3 s par le
   serveur (lecture canonique `GET /v1/charges/{id}`), jamais déduit côté navigateur.
4. **Activation uniquement** sur un état `succeeded` reçu de Malipo (webhook signé ou lecture de l'API), avec
   montant, devise et référence identiques à ceux attendus. La fermeture du navigateur n'empêche rien :
   le webhook et le rapprochement terminent le traitement.
5. Preuve de paiement consultable ; notification au propriétaire.

### Règles appliquées en base (`malipo_apply_charge_state`)

- Transitions atomiques (verrou de ligne), idempotentes ; **aucune rétrogradation** d'un état terminal
  (un `pending` ou un `failed` reçu après un `succeeded` est ignoré).
- Un succès après échec/expiration n'est accepté que s'il vient de la **lecture canonique de l'API**.
- Écart de montant, de devise ou de métadonnée → aucune activation, anomalie journalisée.
- Remboursement total → paiement « remboursé », abonnement arrêté, propriétaire notifié.
- Journal des webhooks dédoublonné par identifiant d'événement (`payment_events`).
- Seul le serveur (clé secrète Supabase, rôle `service_role`) peut écrire ; les utilisateurs ne lisent que
  les tentatives de leurs établissements (RLS), l'équipe avec la permission `billing.read`.

### Montants et devises

- Les montants sont calculés en entiers (centimes), jamais en virgule flottante.
- L'API attend un entier ; la documentation « Charges » indique la **plus petite unité** (« 1000 = 10,00 CDF »).
  C'est la valeur par défaut (`MALIPO_AMOUNT_UNIT=minor` : 3,00 USD → `300`). **À confirmer au premier test
  Sandbox** (voir § 4) ; si Malipo attend l'unité principale, passer `MALIPO_AMOUNT_UNIT=major`.
- Les plans sont en USD. En **live**, Malipo encaisse en USD : un plan en CDF est refusé en live tant
  qu'aucune politique de conversion n'est décidée (aucun taux de change n'est inventé).
- Frais : la commission (3,5 % annoncés pour le plan Starter) **n'est jamais ajoutée au prix**. Les frais et
  le net communiqués par Malipo (`fee_amount`, `net_amount`) sont enregistrés et affichés dans l'admin ;
  le paramètre `billing.malipo_fee_estimate_percent` ne sert qu'aux estimations internes.
- Versements (payouts/B2C) : **non implémentés** (hors périmètre, non disponibles en live).

---

## 2. Créer la clé API Sandbox

1. Connectez-vous au tableau de bord Malipo (https://dashboard.malipo.dev).
2. Section **API keys** (environnement **Sandbox**) → créez une clé secrète : elle commence par `sk_test_`.
3. Ne la collez **jamais** dans une conversation, un ticket ou le dépôt Git.

## 3. Où placer les clés

### Sur Vercel (production) — Project → Settings → Environment Variables

| Variable                | Valeur                                                                                | Environnements                   |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| `SUPABASE_SECRET_KEY`   | Clé **secrète** Supabase (Project Settings → API Keys → _Secret keys_, `sb_secret_…`) | Production (+ Preview si besoin) |
| `MALIPO_MODE`           | `sandbox`                                                                             | Production                       |
| `MALIPO_API_KEY`        | votre clé `sk_test_…`                                                                 | Production                       |
| `MALIPO_WEBHOOK_SECRET` | secret de l'endpoint (voir § 3 bis)                                                   | Production                       |
| `MALIPO_AMOUNT_UNIT`    | `minor` (à confirmer, § 4)                                                            | Production                       |
| `CRON_SECRET`           | chaîne aléatoire d'au moins 32 caractères                                             | Production                       |
| `MALIPO_API_BASE_URL`   | facultatif (défaut `https://api.malipo.dev/v1`)                                       | —                                |
| `MALIPO_LIVE_CONFIRMED` | **laisser vide** tant que vous n'avez pas décidé du passage en live                   | —                                |

Puis **Redeploy** (les variables ne s'appliquent qu'aux nouveaux déploiements).

### En local (facultatif) — fichier `.env.local` (ignoré par Git)

Mêmes noms de variables. Modèle sans valeur : `.env.example`.

> L'hébergement est **Vercel** (pas Hostinger) : aucune configuration PHP/Composer n'est nécessaire,
> l'intégration est écrite en TypeScript dans l'application Next.js existante.

## 3 bis. Secret et URL du webhook

1. Tableau de bord Malipo → **Webhooks** → ajouter un endpoint :
   **`https://boyoma-connect.vercel.app/api/webhooks/malipo`**
2. Événements : `charge.succeeded`, `charge.failed`, `charge.declined`, `charge.expired`, `charge.refunded`.
3. Copiez le **secret de signature** de cet endpoint (64 caractères hexadécimaux, sans préfixe) dans
   `MALIPO_WEBHOOK_SECRET`, puis redéployez.
4. Un webhook à signature invalide reçoit HTTP 400 ; sans configuration serveur, HTTP 503 (Malipo pourra réessayer).

## 4. Effectuer un paiement test

### a) Valider la passerelle (sans toucher à la base)

```bash
node --env-file=.env.local scripts/malipo-sandbox-test.mjs +243812345678 ORANGE_MONEY
```

Le script refuse toute clé autre que `sk_test_`. Il crée les transactions spéciales de la documentation
(100 succès ~90 %, 200 fonds insuffisants, 300 refus, 400 délai, 500 réseau indisponible, 600 PIN invalide,
en CDF), affiche leur statut final, et vérifie les refus « clé invalide » et « numéro invalide ».
**Contrôlez ensuite dans Sandbox → Payments comment s'affiche la transaction « 100 »** : 1,00 CDF ⇒ garder
`MALIPO_AMOUNT_UNIT=minor` ; 100 CDF ⇒ passer à `major`.

### b) Parcours complet dans l'application

1. Espace pro → votre établissement → **Abonnement** → « Payer par Mobile Money » sur un plan.
2. Choisissez l'opérateur, saisissez le numéro, payez. L'écran d'attente apparaît (bandeau « Mode test »).
3. Les plans étant en USD, la transaction Sandbox suit le traitement normal (~90 % de succès).
   Les montants spéciaux CDF ne s'appliquent qu'aux tests du script (aucun prix n'a été créé pour les tests).

## 5. Vérifier la confirmation

- Côté propriétaire : statut « Paiement confirmé », plan actif, **Preuve de paiement**, notification.
- Côté équipe : **Admin → Mobile Money** (`/admin/paiements`) : statut, référence `ch_…`, frais/net, anomalies ;
  « Rapprocher maintenant » relit chez Malipo les paiements restés en attente ; export CSV.
- Journal d'audit (`/admin/journal`) : `payment.malipo_initiated`, `payment.malipo_succeeded`, `payment.confirmed`…
- Journal des webhooks : table `payment_events` (fournisseur `malipo`, `processed_at`, `processing_error`).

## 6. Passage en production (live) — **uniquement sur votre décision**

1. Terminez la vérification KYC/KYB et faites approuver votre destination de versement (Malipo → **Go live**).
2. Une fois approuvé, générez la clé **`sk_live_…`** et créez l'endpoint webhook **live** (même URL) ; son secret
   est différent.
3. Sur Vercel : `MALIPO_MODE=live`, `MALIPO_API_KEY=sk_live_…`, `MALIPO_WEBHOOK_SECRET=<secret live>`,
   **`MALIPO_LIVE_CONFIRMED=oui`**, puis redéployez. Sans `MALIPO_LIVE_CONFIRMED=oui`, ou avec une clé qui ne
   correspond pas au mode, l'encaissement reste désactivé.
4. Vérifiez les plans (prix en USD) et la limite Starter (500 USD/mois de volume live).
5. Effectuez un premier paiement réel de faible montant avec votre propre numéro, vérifiez-le dans l'admin
   et dans le tableau de bord Malipo.

## 7. Étapes manuelles restant à faire dans vos comptes

- [ ] Malipo : créer la clé `sk_test_` (§ 2).
- [ ] Malipo : déclarer l'endpoint webhook et copier son secret (§ 3 bis).
- [ ] Supabase : copier la clé secrète serveur (`SUPABASE_SECRET_KEY`).
- [ ] Vercel : renseigner les variables (§ 3), générer `CRON_SECRET`, redéployer.
- [ ] Lancer le script Sandbox et **confirmer l'unité des montants** (§ 4 a).
- [ ] Faire un paiement test dans l'application et vérifier l'admin (§ 4 b, § 5).
- [ ] Plus tard, sur décision : KYC, clé live, passage en live (§ 6).

## 8. Limites connues

- Le rapprochement planifié est **quotidien** (limite du plan Vercel Hobby) ; en complément, l'écran d'attente
  actualise le statut et l'admin dispose d'un rapprochement manuel.
- La documentation ne décrit pas la politique de renvoi des webhooks ; le rapprochement couvre les pertes.
- Le contenu exact des webhooks (présence de `metadata`) n'est pas documenté : le serveur relit toujours la
  transaction via l'API, et ne rattache une transaction inconnue que si l'événement **signé** porte notre
  identifiant de paiement.
