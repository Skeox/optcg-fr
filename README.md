# OPTCG FR — collection One Piece Card Game (version française)

Application web installable sur iPhone (PWA, sans App Store) pour :

- **scanner** ses cartes VF avec l'appareil photo et les ajouter à sa collection (nombre d'exemplaires) ;
- consulter le **minimum CardTrader français** relevé pour chaque carte et son évolution ;
- parcourir **toutes les cartes VF** (catalogue officiel Bandai FR) avec recherche et filtres (série, couleur, type, rareté, possédées / manquantes / doublons) ;
- voir ce qui **manque** par série et ce que cela coûterait ;
- repérer ses **doublons** et exporter la liste (texte ou CSV) pour la mise en vente.

La collection reste disponible localement sur le téléphone (IndexedDB). Une **sauvegarde automatique privée sur Turso** peut être connectée depuis *Plus › Réglages* : ajouts et retraits sont envoyés après chaque modification, avec reprise hors connexion. Sans activation, les données restent uniquement sur l'appareil. Conservez aussi un export JSON manuel.

### Sauvegarde externe et récupération

Le dossier [server](server/README.md) contient le service privé à héberger en HTTPS et les instructions Turso. La base `optcg-fr-backup` est dédiée à cette application. La clé Turso reste côté serveur ; le mobile utilise une clé de récupération personnelle, enregistrable dans un fichier privé hors du navigateur.

Après un nettoyage des données du site, rechargez ce fichier dans *Réglages → Sauvegarde automatique*, puis **Connecter et restaurer**. Une copie locale vide ne remplace jamais automatiquement la collection distante. L'indicateur en haut de l'application distingue les modifications en attente des sauvegardes confirmées. Une modification faite hors connexion doit être envoyée avant d'effacer les données locales.

Le site GitHub Pages et la base Turso ne suffisent pas seuls : le service Node doit également être hébergé et relié dans les réglages. Détails : [installation et garanties](server/README.md).

## Sources de données

| Donnée | Source | Fichier généré |
| --- | --- | --- |
| Cartes VF (noms, textes, images, séries) | Site officiel `fr.onepiece-cardgame.com/cardlist` | `public/data/cards.json` |
| Catalogue Cardmarket et archive des prix toutes langues (jeu n°18) | Fichiers publics quotidiens `downloads.s3.cardmarket.com` (catalogue produits + guide des prix) | `public/data/prices.json`, `public/data/history.json` |
| Prix minimums français | API officielle CardTrader, annonces françaises en EUR | `public/data/prices-fr.json` |
| Empreintes d'images pour le scan | Calculées (dHash 256 bits) sur les images officielles, filigrane « SAMPLE » retiré | `public/data/hashes.json` |

La version française a démarré avec OP-09 et ST-15 (février 2025). Les cartes plus anciennes (OP-01 à OP-08) n'existent en VF que via les réimpressions des Premium Boosters *The Best* (PRB-01/02) : elles figurent donc dans le catalogue sous ces séries.

### Prix en français : minimum uniquement

Le prix de référence est le **minimum des annonces françaises CardTrader, en euros, tous états et hors frais de port**. Les prix sont récupérés automatiquement chaque jour par le workflow GitHub, avec le secret existant CARDTRADER_TOKEN. La collecte utilise le filtre language=fr puis vérifie la langue et la devise de chaque annonce. Les lots, cartes gradées, vendeurs en vacances et annonces sans stock sont exclus. Un échec de collecte conserve le précédent relevé.

La fiche et les vignettes conservent un lien Cardmarket sous le prix, filtré sur les annonces françaises (language=2). Le catalogue Cardmarket sert aux correspondances entre éditions et variantes ; ses prix ne servent plus aux estimations.

La collection, les doublons, les cartes manquantes et les exports utilisent tous le minimum CardTrader VF. Sans annonce française connue, le prix reste indisponible et les totaux signalent leur couverture partielle. Les anciens prix saisis restent conservés dans les sauvegardes mais ne remplacent plus les prix CardTrader. Les nouveaux instantanés et graphiques sont séparés des anciens relevés Cardmarket.

Une association automatique Cardmarket n'est retenue que si une seule variante FR et un seul produit occidental correspondent dans l'édition, sans conflit entre séries, ou si une correspondance exacte a été vérifiée. L'ordre des suffixes Bandai (_p1, _p2…) et des identifiants Cardmarket ne garantit pas la même illustration. Cette règle s'applique aux **37 collections**, y compris aux anciennes associations sauvegardées : le code seul ne suffit plus à valider un choix enregistré. Un choix non confirmé est ignoré et signalé sur la fiche, sans supprimer la donnée personnelle. En cas d'ambiguïté, la fiche propose une recherche explicitement signalée et aucun lien produit ni prix automatique n'est attribué.

La collecte CardTrader exige également des identifiants Cardmarket explicites. Elle refuse les fiches qui mélangent plusieurs codes, plusieurs produits d'une même édition ou des identifiants inconnus ; aucun repli par code seul n'est permis. Les nouveaux relevés enregistrent le blueprint CardTrader et le produit Cardmarket retenus. Les anciens relevés restent identifiés comme sans provenance dans l'audit : ils nécessitent une collecte complète pour contrôler cette étape, avant toute collecte partielle `--only`.

Les correspondances vérifiées individuellement dans `src/data/card-printings.json` sont également utilisables, après validation du code et de l'extension. Ce fichier documente les sources et distingue illustration d'origine, Jolly Roger, illustration étendue et illustration alternative pour les cartes contrôlées. Vergo PRB01 V.3 correspond à `OP03-079_p4` (produit 799250) ; Niji PRB01 V.3 à `OP06-065_p3` (produit 799370). Les autres correspondances restent inconnues tant qu'elles ne sont pas vérifiées. Ces métadonnées survivent aux reconstructions du catalogue et ne changent aucun identifiant de collection.

La revue du 14 octobre 2026 dans `src/data/printing-reviews.json` décrit les 634 impressions de PRB01/PRB02 et les 177 réimpressions des decks que le filtre « base » masquait à tort. Les 319 impressions PRB01 comprennent 104 versions de base identifiées ; sept codes n'y existent qu'en manga. Les 315 impressions uniques PRB02 comprennent 173 versions de base, sans confondre les parallèles de même illustration. Le site officiel y liste deux fois `ST20-003_p1` : une seule entrée est conservée. Les descriptions de finition ne créent aucune association de prix supplémentaire.

Les finitions PRB ne sont pas déduites de l'ordre des suffixes. Catalogue et cartes manquantes utilisent la même définition de « base » ; le plus petit suffixe ne suffit plus, notamment pour les mangas et SP présents seuls dans une série. Le scanner demande un choix explicite dès qu'un code possède plusieurs impressions dont une PRB, y compris si le résultat classé premier est l'édition d'origine. Une réimpression identique à l'original ne permet pas d'en déduire la provenance sur la seule image ; aucune édition fictive n'est créée pour la séparer. L'absence d'annonce CardTrader française reste affichée comme un prix indisponible, même lorsque le lien Cardmarket est confirmé.

## Développement (Windows)

```bash
npm install
npm run data:all      # cartes (site officiel) + prix (Cardmarket) + empreintes (images)
npm run dev           # http://localhost:5173 (et sur le réseau local)
```

Scripts de données :

- `npm run data:cards` — reconstruit le catalogue FR (cache HTML dans `.cache/html`, `--force` pour re-télécharger) ;
- `npm run data:prices` — met à jour les prix et l'historique hebdomadaire ;
- `npm run data:hashes` — télécharge les images manquantes (`.cache/images`) et calcule les empreintes, après avoir retiré le filigrane « SAMPLE » (absent des vraies cartes) ;
- `npm run data:sample-alpha` — re-mesure ce filigrane sur les images en cache et réécrit `scripts/sample-alpha.png` (forme des lettres × opacité). À relancer seulement si Bandai change son filigrane : sur le site FR c'est un calque blanc d'opacité 0,70 couvrant 8,9 % de la carte, identique sur toutes les cartes sauf six qui n'en portent pas ;
- `npm run data:images` — génère les miniatures locales (`public/images/cards`, ~75 Mo) ;
- `npm run icons` — régénère les icônes PWA.

Quand une nouvelle série sort en VF, ajoutez-la dans `scripts/series-fr.json` (id de la page officielle + extension Cardmarket) et dans `scripts/cm-expansions.json` si l'extension Cardmarket est nouvelle, puis relancez `npm run data:all`.

## Déploiement et installation sur iPhone

La caméra exige HTTPS : le plus simple est GitHub Pages.

1. Créez un dépôt GitHub (par ex. `optcg-fr`) et poussez ce projet sur la branche `main`.
2. Dans *Settings › Pages*, choisissez **Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` construit le site et le publie à `https://<votre-compte>.github.io/optcg-fr/`. Il tourne aussi **chaque jour** pour rafraîchir les prix CardTrader FR et le catalogue Cardmarket (commit automatique de `prices.json` / `history.json`), **sans que votre PC soit allumé**.
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

- **Scanner une carte** ouvre directement la caméra arrière en mode carte entière. Placez la carte dans le cadre : trois lectures concordantes déclenchent les résultats sans prendre de photo. Le scanner compare également le cadre-guide lorsque les contours sont peu visibles. Le calcul continu se fait dans un Web Worker pour garder l'aperçu fluide.
- **Match 100% / Match 80%** indique la similarité visuelle des empreintes, et non une probabilité de reconnaissance. Le code et le nom peuvent corriger le classement, sans gonfler ce pourcentage. Vérifiez la version avant d'ajouter la carte.
- **Après 20 secondes de caméra active sans résultat**, un bouton propose de scanner le bas de la carte. Cadrez de près le nom et le code (ex. OP17-001) : deux lectures concordantes du code connu, ou d'un nom très proche, affichent les variantes. Ce mode reste aussi accessible dès le départ.
- *Analyser maintenant*, *Photo* et la recherche manuelle restent disponibles. La caméra s'arrête à l'affichage des résultats, à la sortie de l'écran ou lorsque l'application passe en arrière-plan. *Refaire* ouvre une nouvelle session ; une ancienne réponse OCR ne peut pas modifier les nouveaux résultats.
- Utilisez une lumière uniforme, sans reflets. La caméra exige HTTPS (ou localhost). Le premier chargement de l'OCR français nécessite une connexion.

## Vérification

La commande npm test vérifie le déclenchement sans clic, le délai de 20 secondes, la lecture automatique du bas, le refus caméra, les réponses OCR tardives, la stabilité des correspondances et la référence de prix VF. Les tests de caméra utilisent un flux simulé : la mise au point, les reflets et les performances doivent encore être validés sur un téléphone avec de vraies cartes.

npm run build vérifie TypeScript et construit la PWA ; npm run lint analyse le code.

`npm run data:audit` contrôle les 37 collections et les associations de toutes les cartes : code, édition, produit, ancienne association sauvegardée, absence de produit partagé entre variantes d'une même série et provenance des prix. `--online` compare aussi les 37 listes Bandai et le catalogue Cardmarket courant ; `--cached` réutilise les réponses du précédent contrôle. Le rapport détaillé est écrit dans `.cache/catalogue-audit/report.json` : liens résolus et prix réellement disponibles sont comptés séparément.

Les correspondances explicites et leurs preuves sont dans `scripts/data/merchant-evidence.json`. Elles proviennent du catalogue public CardTrader (fiche, illustration, code, édition et finition), comparé aux images Bandai. Les rapprochements d'images ne sont que des propositions : les finitions PRB, les tampons promotionnels, les variantes proches et les incohérences marchandes demandent une revue. Les suffixes Bandai, les rangs Cardmarket et les montants ne servent jamais à associer les variantes. Les preuves distinguent comparaison d'image, finition décrite et revue visuelle ; les fichiers légers utilisés par l'application sont générés par `node scripts/build-merchant-mappings.mjs`.

`node scripts/discover-cardmarket-mappings.mjs` prépare des propositions dans le cache sans modifier le registre publié ; `--blueprints` explore aussi les fiches dépourvues de lien Cardmarket. L'audit bloque la publication si une illustration officielle, l'identité d'une fiche marchande ou son lien produit change. Les corrections ponctuelles de codes marchands sont limitées à des fiches et produits explicitement relus dans `src/data/cardtrader-corrections.json`.

La collecte conserve les annonces par fiche CardTrader et par langue. Quand une fiche exacte a été identifiée, son prix prime sur l'agrégation par produit Cardmarket. Une fiche sans annonce française ne reprend jamais le prix anglais, japonais ou d'une autre finition. Une fiche identifiée sans lien Cardmarket peut fournir un prix CardTrader et une recherche Cardmarket, sans inventer de lien direct. Les réimpressions physiquement indissociables ou sans preuve suffisante restent non confirmées. Un premier relevé complet est obligatoire avant une actualisation partielle.

Contrôle du 16 octobre 2026 : 2 732 liens Cardmarket sur 2 888 impressions, plus 23 fiches CardTrader sans lien Cardmarket confirmé. Ces nombres décrivent les associations, pas la disponibilité des annonces ni une garantie absolue d'absence d'erreur. Le rapport courant fournit les comptes détaillés par collection et par langue.

## Structure

```
scripts/              collecte des données (Node 20+)
public/data/          JSON générés (cartes, prix, historique, empreintes)
src/data/             chargement des données + contexte React
src/lib/              Cardmarket (liens, association produit), vision (contour, redressement, empreintes), OCR, filtres
src/pages/            Accueil, Cartes, Fiche carte, Scanner, Collection, Manquantes, Doublons, Réglages
src/db.ts             base locale Dexie (collection, choix Cardmarket, instantanés de prix, réglages)
```

Projet personnel, non affilié à Bandai, Shueisha / Eiichiro Oda ni à Cardmarket.
