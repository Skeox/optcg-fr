# OPTCG FR — collection One Piece Card Game (version française)

Application web installable sur iPhone (PWA, sans App Store) pour :

- **scanner** ses cartes VF avec l'appareil photo et les ajouter à sa collection (nombre d'exemplaires) ;
- consulter la **valeur Cardmarket** de chaque carte (tendance, mini, moyennes 1/7/30 j) et son évolution ;
- parcourir **toutes les cartes VF** (catalogue officiel Bandai FR) avec recherche et filtres (série, couleur, type, rareté, possédées / manquantes / doublons) ;
- voir ce qui **manque** par série et ce que cela coûterait ;
- repérer ses **doublons** et exporter la liste (texte ou CSV) pour la mise en vente.

Tout est stocké localement sur le téléphone (IndexedDB). Aucune donnée personnelle ne quitte l'appareil ; pensez à **exporter la sauvegarde** depuis *Plus › Réglages*.

## Sources de données

| Donnée | Source | Fichier généré |
| --- | --- | --- |
| Cartes VF (noms, textes, images, séries) | Site officiel `fr.onepiece-cardgame.com/cardlist` | `public/data/cards.json` |
| Prix Cardmarket (jeu n°18) | Fichiers publics quotidiens `downloads.s3.cardmarket.com` (catalogue produits + guide des prix) | `public/data/prices.json`, `public/data/history.json` |
| Empreintes d'images pour le scan | Calculées (dHash) sur les images officielles | `public/data/hashes.json` |

La version française a démarré avec OP-09 et ST-15 (février 2025). Les cartes plus anciennes (OP-01 à OP-08) n'existent en VF que via les réimpressions des Premium Boosters *The Best* (PRB-01/02) : elles figurent donc dans le catalogue sous ces séries.

**Limite connue** : le guide des prix Cardmarket ne distingue pas les langues. Le prix affiché est celui du produit toutes langues confondues ; le bouton *Voir les annonces en français* ouvre la page Cardmarket filtrée sur les cartes VF pour vérifier le prix réel. Chaque variante FR (base, alternative _p1, _p2…) est associée automatiquement à la version Cardmarket correspondante (V1, V2…) ; si l'association est fausse, choisissez le bon produit dans la fiche carte (*Produits Cardmarket pour ce code*).

## Développement (Windows)

```bash
npm install
npm run data:all      # cartes (site officiel) + prix (Cardmarket) + empreintes (images)
npm run dev           # http://localhost:5173 (et sur le réseau local)
```

Scripts de données :

- `npm run data:cards` — reconstruit le catalogue FR (cache HTML dans `.cache/html`, `--force` pour re-télécharger) ;
- `npm run data:prices` — met à jour les prix et l'historique hebdomadaire ;
- `npm run data:hashes` — télécharge les images manquantes (`.cache/images`) et calcule les empreintes ;
- `npm run icons` — régénère les icônes PWA.

Quand une nouvelle série sort en VF, ajoutez-la dans `scripts/series-fr.json` (id de la page officielle + extension Cardmarket) et dans `scripts/cm-expansions.json` si l'extension Cardmarket est nouvelle, puis relancez `npm run data:all`.

## Déploiement et installation sur iPhone

La caméra exige HTTPS : le plus simple est GitHub Pages.

1. Créez un dépôt GitHub (par ex. `optcg-fr`) et poussez ce projet sur la branche `main`.
2. Dans *Settings › Pages*, choisissez **Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` construit le site et le publie à `https://<votre-compte>.github.io/optcg-fr/`. Il tourne aussi **chaque jour** pour rafraîchir les prix Cardmarket (commit automatique de `prices.json` / `history.json`).
4. Sur l'iPhone, ouvrez l'URL dans **Safari**, puis *Partager › Sur l'écran d'accueil*. L'application s'ouvre ensuite en plein écran comme une app native et fonctionne hors ligne (sauf mise à jour des prix).

Si le dépôt est privé, GitHub Pages nécessite un compte GitHub Pro ; en dépôt public, seules les données de cartes/prix sont exposées (jamais votre collection, qui reste sur le téléphone).

### Alternative sans GitHub

`npm run build` puis servez le dossier `dist/` derrière n'importe quel hébergement HTTPS statique (Netlify, Vercel, Cloudflare Pages…). Lancez `npm run data:prices` avant chaque build pour actualiser les prix.

## Conseils pour le scan

- Posez la carte à plat, lumière uniforme, sans reflet sur la surface brillante, et alignez-la dans le cadre.
- L'application classe les cartes par ressemblance d'image (illustration) et lit le code imprimé en bas à gauche (OCR) pour départager les versions. Les alternatives d'une même carte apparaissent côte à côte : vérifiez la miniature avant d'ajouter.
- Si rien ne convient, saisissez le code (ex. `OP09-001`) dans le champ sous la liste.

## Structure

```
scripts/              collecte des données (Node 20+)
public/data/          JSON générés (cartes, prix, historique, empreintes)
src/data/             chargement des données + contexte React
src/lib/              Cardmarket (liens, association produit), hachage d'image, OCR, filtres
src/pages/            Accueil, Cartes, Fiche carte, Scanner, Collection, Manquantes, Doublons, Réglages
src/db.ts             base locale Dexie (collection, choix Cardmarket, instantanés de prix, réglages)
```

Projet personnel, non affilié à Bandai, Shueisha / Eiichiro Oda ni à Cardmarket.
