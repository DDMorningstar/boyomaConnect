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

## « C'est gratuit » 30 s (9:16, 1:1, 16:9)

Même montage décliné en trois formats (`src/Gratuit30.tsx`, mise en page adaptée à chaque format).
Aucune mention de paiement ni de Mobile Money.

| Temps   | Scène                                                                                |
| ------- | ------------------------------------------------------------------------------------ |
| 0–3 s   | « Trouver une adresse à Kisangani, ça coûte combien ? » → compteur jusqu'à **0 FC**  |
| 3–7 s   | « Rien. » + tampon GRATUIT + nouveau logo et slogan                                  |
| 7–13 s  | Visiteurs : recherche, appel et WhatsApp, itinéraire, sans inscription (capture)     |
| 13–18 s | Chiffres réels : 200+ lieux, 44 catégories, Kisangani + 7 territoires (capture zone) |
| 18–24 s | Établissements : « Votre fiche est gratuite » (photos, contacts, catalogue, horaires) |
| 24–30 s | Logo, « 100 % gratuit », boyoma-connect.vercel.app                                   |

Chiffres au 14/10/2026 (233 lieux publiés, 44 catégories). Fichiers produits : `out/boyoma-connect-gratuit-9x16.mp4`
(statuts WhatsApp, Reels, TikTok, Shorts), `-1x1.mp4` (fil Facebook / Instagram), `-16x9.mp4` (YouTube, site).

```bash
node scripts/stills-gratuit.mjs   # images de contrôle des 3 formats (out/stills)
npm run render:gratuit            # les 3 vidéos
```

## Voix 33 s (vertical 9:16, avec voix off)

`src/Voix33.tsx` : voix Windows « Microsoft Hortense » (une piste par phrase, horodatage de chaque mot),
sous-titres karaoké, lettres animées en 3D, impacts avec secousse, flashs, traînées lumineuses, particules,
zoom caméra jusqu'au bouton Appeler réel. Son 100 % synthétisé (nappe 100 BPM, souffles, impacts) : aucun droit
à acquérir. Aucune mention de paiement.

```bash
powershell -ExecutionPolicy Bypass -File scripts/voice.ps1   # voix + src/voice.json (fichier en UTF-8 avec BOM)
node scripts/sfx.mjs                                         # effets et nappe (public/sfx)
npm run render:voix                                          # out/boyoma-connect-voix-9x16.mp4
```

Machine à 2 cœurs : les rendus utilisent `--gl=angle` (carte graphique), environ 2 fois plus rapide.

## Tutoriel « Inscrire son établissement » (vertical, ~1 min 54, voix off)

`src/Tuto.tsx` : 16 phrases (voix Hortense, `scripts/voice-tuto.ps1` → `src/voice-tuto.json`), barre des
6 étapes (Vérifier, Compte, Fiche, Contacts, Photos, Validation), sous-titres karaoké, touchers animés, zooms
sur chaque champ.

- Écrans publics : vraies captures de production (`scripts/capture-tuto.mjs` : connexion, « Créer un compte »,
  « Ajouter mon établissement » ; plus `search.png` et `home.png`).
- Écrans réservés aux comptes connectés (formulaire « Créer la fiche de mon établissement », Espace pro) :
  reconstitués d'après le code de l'application (mêmes titres, champs, boutons et messages). Aucune connexion
  à un compte n'a été utilisée pour la vidéo.
- Données d'exemple génériques : « Mon établissement », « vous@exemple.com », numéro masqué, catégorie
  « Restaurants » et commune « Makiso » (réelles dans l'application).

```bash
node scripts/capture-tuto.mjs                                   # captures publiques
powershell -ExecutionPolicy Bypass -File scripts/voice-tuto.ps1 # voix + src/voice-tuto.json
node scripts/sfx.mjs                                            # nappe music-tuto.wav (120 s)
npm run render:tuto                                             # out/boyoma-connect-tutoriel-inscription.mp4
```

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
