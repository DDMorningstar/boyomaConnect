# Module d'importation de données géographiques (décision D30)

Console : `/admin/importations` (permission `imports.view` pour consulter, `imports.manage` pour agir ;
attribuées à `admin` et `super_admin`, consultation pour `moderator`).

## Sources acceptées

| Source (`import_sources`)                 | Licence                               | Accès                                                        | État              |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------ | ----------------- |
| `osm` — OpenStreetMap                     | ODbL 1.0 (partage à l'identique)      | API Overpass + fichiers .osm / JSON / GeoJSON exportés d'OSM | active            |
| `open_data` — fichier de données ouvertes | déclarée à chaque lot (+ attestation) | GeoJSON, JSON, CSV                                           | active            |
| `partner` — partenaires                   | accord écrit                          | fichiers                                                     | prévue (inactive) |
| `owner` — établissements                  | consentement                          | fichiers                                                     | prévue (inactive) |

**Exclu : Google Maps** (dont les outils de « scraping » comme `gosom/google-maps-scraper`). Les conditions
d'utilisation de Google interdisent l'extraction et la rediffusion de ses données ; elles ne sont pas
« légalement réutilisables » (décision D17). Le lien « Itinéraire » vers Google Maps reste un simple lien.

Ajouter une source (ex. un portail de données ouvertes) : une ligne dans `import_sources` (migration), avec
licence, attribution, `share_alike`, et pour une API `api_url` + `min_request_interval_seconds`.

## Chaîne de traitement

1. **Lecture** (`src/features/imports/parsers.ts`) : OSM XML (nœuds ; voies/relations ramenées au centre),
   JSON Overpass, GeoJSON (points ; polygones → centre approximatif), JSON générique, CSV (« ; », « , »,
   tabulation, guillemets). 5 000 lieux et 4 Mo maximum par lot.
2. **Normalisation** (`normalize.ts`) : uniquement les attributs présents — nom, catégorie, coordonnées
   (précision « exacte » pour un point, « approximative » pour un centre d'emprise), adresse
   (`addr:*`), téléphones (format +243), site web, e-mail, image (lien https ou Wikimedia Commons, jamais
   copiée), horaires (`opening_hours` interprété si forme simple, sinon conservé brut), attributs bruts.
3. **Correspondance des catégories** : table `osm_category_mappings` (98 règles initiales, éditables dans
   `/admin/importations/correspondances`, priorité + condition, ex. `amenity=place_of_worship` +
   `religion=muslim` → Mosquées). Fichiers génériques : colonne catégorie = slug, nom ou `clé=valeur`.
4. **Analyse en base** (`import_analyze_batch`) : rattachement par `locate_unit`, contrôle de zone,
   doublons (même identifiant source → actualisation ; < 150 m et nom similaire ≥ 0,5 ; même nom dans la même
   unité ; répétition dans le lot), statut.
5. **Prévisualisation et décisions** : accepter (avec catégorie), créer malgré un doublon, rattacher à
   l'existant, ignorer, rejeter (`import_decide_item`, journalisé).
6. **Import par tranches** (`import_commit_batch`, 100 éléments par transaction) : création des lieux
   (non vérifiés ; « à valider » ou publiés selon le mode), contacts, horaires, provenance dans
   `place_external_refs` (source, identifiant, licence, attribution, date de collecte, lot, extras).
   Erreur sur un élément : rejeté avec le motif ; erreur de tranche : lot « interrompu », **reprise** au
   point d'arrêt.

### Anomalies

| Rejet                                                                                                                             | Quarantaine (à vérifier)                                                                                                 | Information                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| nom absent, lieu disparu (`disused:*`, « ex. »), contact personnel bloqué, coordonnées invalides, hors zone, hors limites connues | catégorie non reconnue, position absente, nom générique (« Police »), nom suspect, nom trop long, identifiant OSM absent | téléphone / site / e-mail illisibles (ignorés), horaires non interprétés, rattachement à la zone |

### Actualisation

Un lieu existant de la même source n'est modifié que s'il est encore « non vérifié », à coordonnées
importées et **non géré par un établissement** ; les contacts manquants sont ajoutés, jamais supprimés.

## Limites des services publics

- Overpass : une requête par minute au plus pour toute l'équipe (`import_reserve_request`, verrou en
  base), emprise ≤ 8°, délai serveur 120 s, User-Agent identifié, réponse ≤ 20 Mo.
- Synchronisations (`import_schedules`) : intervalle ≥ 7 jours (`min_sync_interval_hours`). À l'échéance,
  la synchronisation est « due » dans la console ; son lancement crée un lot à contrôler. Aucune exécution
  automatique sans clé de service (non configurée) : choix volontaire de contrôle humain.

## ODbL (OpenStreetMap)

- Attribution « © Contributeurs OpenStreetMap » sur chaque fiche concernée (lien vers l'objet d'origine),
  dans le pied de page et sur `/sources`.
- Partage à l'identique : extrait public de la base dérivée en GeoJSON sous ODbL —
  `/api/exports/osm` (fonction `osm_derived_places`, lieux publiés seulement, aucune donnée personnelle).
- Les ajouts des établissements et des agents ne sont pas mélangés à cet extrait.

## Autres villes de la RDC

Le module n'est pas propre à la Tshopo : toute province, ville ou territoire du référentiel
(`geographic_units`) est sélectionnable. Avec une limite (`geographic_boundaries`), le contrôle de zone et
le rattachement sont précis ; sans limite, l'emprise vient du centre (± 0,2°) et les lieux sont rattachés à la
zone (signalé « rattaché à la zone »).

## Tests

- Unitaires : `tests/unit/imports.test.ts` (lecture des 5 formats, normalisation, correspondances, horaires,
  requête Overpass).
- Base : `supabase/tests/imports_smoke.sql` — bloc qui se termine toujours par une exception
  `IMPORT_TEST_OK` : la transaction est annulée, **aucune donnée ne subsiste** (pas de test destructif en
  production). Couvre refus sans permission, statuts d'analyse, décision, import par tranches avec reprise,
  provenance, contacts, horaires, verrou après import, audit.
