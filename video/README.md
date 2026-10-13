# Vidéos publicitaires de Boyoma Connect

Projet [Remotion](https://www.remotion.dev) indépendant de l'application (dépendances propres, exclu de
TypeScript, ESLint et Prettier de l'app).

## Démo 30 s (vertical 9:16, 1080 × 1920, 30 i/s)

| Temps       | Scène                                                         |
| ----------- | ------------------------------------------------------------- |
| 0–3 s       | Accroche « Une pharmacie ? Un hôtel ? Un garage ? »           |
| 3–5,5 s     | Logo et slogan                                                |
| 5,5–11 s    | Recherche : compteur 233 lieux, accueil → résultats « hotel » |
| 11–16,5 s   | Fiche réelle (Rex Transit) qui défile, repères animés         |
| 16,5–20,5 s | Appeler, WhatsApp, Itinéraire (barre d'actions réelle)        |
| 20,5–25 s   | Carte de la Tshopo et les 7 territoires                       |
| 25–30 s     | « Trouvez. Appelez. Allez-y. » + boyoma-connect.vercel.app    |

Règles : uniquement de vraies captures de l'application en production et de vrais chiffres (au
12/10/2026) ; aucune donnée personnelle (la section Contacts est exclue des captures) ; attribution de la
carte (OpenFreeMap, OpenMapTiles, OpenStreetMap) affichée. Pas de musique fournie : vidéo pensée pour une
lecture sans son ; ajouter une piste libre de droits au montage si besoin.

## Commandes

```bash
npm install
node scripts/capture.mjs          # captures d'écran (production, thème sombre, 3x)
node scripts/capture-place.mjs    # fiche pleine page + barre d'actions (sans contacts)
npm run studio                    # aperçu interactif
npm run render                    # out/boyoma-connect-demo-30s.mp4
```

Mettre à jour les chiffres (`233 lieux`, `10 lieux trouvés`) dans `src/Demo30.tsx` si les données changent.

## Licence Remotion

Gratuite pour un particulier ou une structure de 3 personnes au plus ; au-delà, licence entreprise payante
(voir remotion.dev/license).
