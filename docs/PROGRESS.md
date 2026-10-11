# Avancement — mis à jour le 11/10/2026

## Réellement exécuté et vérifié
- Projet Supabase `boyoma-connect` créé (plan gratuit, eu-west-3).
- 9 migrations appliquées sans erreur : extensions/PostGIS, identité & permissions, géographie (Tshopo,
  Kisangani, 6 communes), catégories (12 + 72), établissements, interactions, collecte & workflows,
  commerce/tourisme/paramètres/stockage, fonctions de recherche.
- Test SQL (transaction annulée) : recherche texte, tolérance aux fautes, filtre catégorie+ville avec
  descendants, rayon, distance (8 220 m, cohérent), bbox, suggestions ; RLS visiteur (lieux publiés seuls,
  pas de profils, insertion et paiement refusés).
- Fonctions utilitaires (`src/lib/format.ts`) exécutées : toutes les assertions passent ; haversine 8 231 m.

## Écrit mais PAS encore exécuté
L'environnement de génération n'avait pas accès au registre npm : `npm install`, typecheck, lint, Vitest,
build et Playwright **n'ont pas encore tourné**. À lancer dans `D:\Boyoma` :
```
npm install
npm run check
```
Toute erreur doit être corrigée avant de considérer les phases 1, 2, 5 et 6 comme terminées.

## Non testé
- Rendu visuel réel, Lighthouse, Web Vitals (aucune mesure effectuée).
- Carte (dépend du fournisseur de tuiles), géolocalisation, installation PWA, Service Worker.
- RLS pour les rôles connectés (nécessite des comptes de test — phase 4).

## Blocages / actions humaines
- Aucun lieu réel en base : à collecter (agents) ou à saisir via l'administration (phase 8).
- Coordonnées de support, textes légaux définitifs : à fournir.
- Compte GitHub / Vercel : connexion manuelle (voir DEPLOYMENT.md).

## Prochaine étape
1. Exécuter `npm install && npm run check`, corriger les erreurs remontées.
2. Phase 4 : authentification (connexion, inscription, middleware de session, pages protégées).
