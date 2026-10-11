# Seeds

Les données de référence **réelles et vérifiées** sont incluses dans les migrations :
province de la Tshopo, ville de Kisangani, ses six communes, catégories, équipements, plans.

Aucun établissement réel n'est créé par les migrations. Les lieux réels proviennent de la saisie
(administration, agents) ou de l'import OpenStreetMap (`scripts/osm-import.mjs`, voir `docs/DATABASE.md`). Pour le développement, utilisez
uniquement des données préfixées `[FICTIF]` (voir `supabase/tests/rls_and_search_smoke.sql`),
et ne les publiez jamais sur l'environnement de production.
