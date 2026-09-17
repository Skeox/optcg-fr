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

### Prix en français : ce qui est possible et ce qui ne l'est pas

Le guide de prix public de Cardmarket ne distingue pas les langues : le prix automatique est celui du produit **toutes langues confondues** (tendance, mini, moyennes). La page produit filtrée (`?language=2`) affiche bien les seules annonces VF (« De x € », nombre d'annonces), mais :

- Cardmarket **bloque les navigateurs automatisés** (« Sorry, you have been blocked ») et n'accepte plus de nouvelles demandes d'accès à son API. L'application ne cherche pas à contourner cette protection.
- **Prix VF automatiques via CardTrader** : cette place de marché européenne (prix alignés sur Cardmarket) a une API publique gratuite qui indique la langue de chaque annonce et relie ses fiches aux produits Cardmarket. Le script `npm run data:prices-fr` (variable `CARDTRADER_TOKEN`) écrit `public/data/prices-fr.json` ; le workflow quotidien le lance automatiquement si le secret `CARDTRADER_TOKEN` existe dans le dépôt. Pour l'activer : créer un compte sur cardtrader.com, copier le jeton API dans les réglages du compte, puis l'ajouter dans *Settings › Secrets and variables › Actions* du dépôt GitHub. En local sous Windows : `$env:CARDTRADER_TOKEN="votre-jeton"; npm run data:prices-fr`. Le prix VF (médiane des annonces françaises, sinon prix mini) s'affiche alors avec un badge « VF » et devient la référence.
- **Saisie manuelle** : dans la fiche carte, *Voir les annonces en français* ouvre la page Cardmarket filtrée VF ; on peut taper le prix constaté dans *Prix VF constaté*. Ce prix (daté) est prioritaire sur tout le reste pour cette carte.
- Format du fichier : `{ updatedAt, source, currency, products: { <idProduct Cardmarket>: { at, n, from, med, nm } } }` (n = nombre d'exemplaires en vente en VF, from = prix mini, med = médiane des annonces les moins chères, nm = mini en état NM/Mint).

Chaque variante FR (base, alternative _p1, _p2…) est associée automatiquement à la version Cardmarket correspondante (V1, V2…) ; si l'association est fausse, choisissez le bon produit dans la fiche carte (*Produits Cardmarket pour ce code*).

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
- `npm run data:images` — génère les miniatures locales (`public/images/cards`, ~75 Mo) ;
- `npm run icons` — régénère les icônes PWA.

Quand une nouvelle série sort en VF, ajoutez-la dans `scripts/series-fr.json` (id de la page officielle + extension Cardmarket) et dans `scripts/cm-expansions.json` si l'extension Cardmarket est nouvelle, puis relancez `npm run data:all`.

## Déploiement et installation sur iPhone

La caméra exige HTTPS : le plus simple est GitHub Pages.

1. Créez un dépôt GitHub (par ex. `optcg-fr`) et poussez ce projet sur la branche `main`.
2. Dans *Settings › Pages*, choisissez **Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` construit le site et le publie à `https://<votre-compte>.github.io/optcg-fr/`. Il tourne aussi **chaque jour** pour rafraîchir les prix Cardmarket (commit automatique de `prices.json` / `history.json`), **sans que votre PC soit allumé**.
4. Sur l'iPhone, ouvrez l'URL dans **Safari**, puis *Partager › Sur l'écran d'accueil*. L'application s'ouvre ensuite en plein écran comme une app native et fonctionne hors ligne (sauf mise à jour des prix).

Si le dépôt est privé, GitHub Pages nécessite un compte GitHub Pro ; en dépôt public, seules les données de cartes/prix sont exposées (jamais votre collection, qui reste sur le téléphone).

### Application native (.ipa) via un sideloader

Le workflow `.github/workflows/ios-ipa.yml` (lancement manuel dans l'onglet *Actions*, ou tag `ios-*`) enveloppe le site dans Capacitor sur un runner macOS et produit un **.ipa non signé** (artefact `OPTCG-FR-unsigned-ipa`). Installez-le avec [Sideloadly](https://sideloadly.io) ou AltStore, qui le signent avec votre identifiant Apple :

- compte Apple gratuit : l'app expire au bout de **7 jours** et doit être re-signée (AltStore le fait automatiquement quand le PC/AltServer est sur le même Wi-Fi), 3 apps maximum ;
- compte développeur payant (99 €/an) : validité 1 an.

Les données (collection, prix saisis) restent dans l'app entre deux re-signatures tant que l'identifiant de bundle `fr.bertrand.optcg` ne change pas. Comparée à la PWA, la version native n'apporte rien de plus fonctionnellement (même moteur WebKit, même caméra) ; elle évite seulement Safari.

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
