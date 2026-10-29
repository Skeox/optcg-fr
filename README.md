# OPTCG FR — collection One Piece Card Game (version française)

Application web installable sur iPhone (PWA, sans App Store) pour :

- **scanner** ses cartes VF avec l'appareil photo et les ajouter à sa collection (nombre d'exemplaires) ;
- consulter le **prix estimé Cardmarket français** relevé pour chaque carte et son évolution ;
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
| Estimation française | Offres Cardmarket FR, moyenne de 5 vendeurs distincts en NM/MT | `public/data/prices-cardmarket-fr.json` |
| Empreintes d'images pour le scan | Calculées (dHash 256 bits) sur les images officielles, filigrane « SAMPLE » retiré | `public/data/hashes.json` |

La version française a démarré avec OP-09 et ST-15 (février 2025). Les cartes plus anciennes (OP-01 à OP-08) n'existent en VF que via les réimpressions des Premium Boosters *The Best* (PRB-01/02) : elles figurent donc dans le catalogue sous ces séries.

### Collecte mensuelle Cardmarket FR

La référence est la **moyenne des cinq offres françaises les moins chères relevées auprès de cinq vendeurs distincts, en état NM/MT, en EUR et hors port**. Ce sont des prix demandés, pas une moyenne de ventes réalisées. Le pays du vendeur ne détermine jamais la langue de la carte. Les offres sans stock, avec attribut supplémentaire (signature, modification) ou description de lot/carte gradée sont exclues. La moyenne est arrondie au centime, sans pondération par la quantité disponible.

Seul le produit exact confirmé par le registre est utilisable. Le guide Cardmarket toutes langues et les anciens prix CardTrader ne sont jamais des replis. Les saisies manuelles restent prioritaires. Sans cinq vendeurs ou après 45 jours sans relevé, le prix automatique est indisponible ; les totaux signalent leur couverture partielle. Les nouveaux instantanés `cmFr` sont séparés des anciens `ctFr`. Les courbes ne comparent que des dates avec les mêmes produits couverts.

**État du 30 octobre 2026 : collecte initiale partielle.** Quatre produits ont été relevés et validés avant un blocage Cloudflare dans Chrome, sur 2 732 correspondances exactes et 2 888 cartes. Niji V.3 : 3,80 € ; Jinbe PRB02-007 V.1 : 0,02 € ; Bartolomeo OP07-031 ST24 : 0,02 € ; Shanks OP09-001 V.1 : 0,02 €. La suite nécessite que Cardmarket rétablisse l’accès. Le compteur des Réglages donne la couverture actuelle ; ne pas assimiler liens confirmés et prix disponibles.

La requête HTTP directe a reçu un 403 Cloudflare : **aucun scraper GitHub autonome n’est présenté comme opérationnel**. Un suivi mensuel est configuré dans ce chat Codex le 1er du mois à 10 h (Europe/Paris) pour reprendre la collecte dans Chrome puis publier les relevés valides. Il nécessite le PC allumé, l’application Codex active et Chrome accessible. Il s’arrête et signale toute vérification nécessitant l’utilisateur. L’actualisation quotidienne GitHub ne concerne désormais que le catalogue Cardmarket, pas les prix FR. Ne pas remettre en service l’ancien collecteur CardTrader comme source de valorisation.

Procédure de reprise (aucun cookie ni mot de passe dans le dépôt) :

1. Exécuter `npm run data:cardmarket-fr`. Ouvrir l’URL locale affichée dans la session Chrome existante. Le serveur écoute uniquement sur 127.0.0.1, avec une URL temporaire et vérification de l’origine.
2. Lire la liste JSON `#targets`, qui ne contient que les produits exacts restant à visiter ce mois-ci. Naviguer séquentiellement, avec modération. Arrêter au premier blocage persistant ; ne pas contourner Cloudflare.
3. Relever uniquement le DOM affiché : URL canonique avec `language=2`, titre `h1` contenant le code, `idReference` du lien de support pour confirmer le produit ; lignes `[id^="articleRow"]`. Pour chaque offre : vendeur `.seller-name a` (href), état `.article-condition`, langue `.product-attributes [aria-label]`, prix `.col-offer .price-container`, quantité `.col-offer .item-count`, autres attributs et commentaire `.product-comments`. Ne pas lire les prix du guide en haut de page.
4. Importer via le champ « Observations JSON » un tableau d’objets `{productId, at, url, title, hasMore, offers}`. `at` est l’instant ISO réel ; chaque offre contient `{seller, condition, language, price, quantity, extras, comment}`. `extras` contient les attributs autres que la langue. `hasMore` reflète la présence de `#loadMoreButton`. Si moins de cinq vendeurs admissibles sont visibles et que d’autres résultats existent, les charger ; sinon l’import refuse de conclure. Une page vide ne peut être validée qu’avec une absence de stock explicitement constatée (`emptyConfirmed: true`). Une page bloquée n’est jamais un produit sans stock.
5. Chaque lot est validé entièrement avant sauvegarde atomique dans `.cache/cardmarket-fr/AAAA-MM.json`. Le cache ne stocke que les agrégats, pas les vendeurs. Un échec conserve les dernières valeurs et leurs vraies dates, sans rafraîchir artificiellement les produits non visités.
6. `npm run data:cardmarket-fr -- --publish` publie les agrégats dans `public/data/prices-cardmarket-fr.json` après validation. `--report` affiche les comptes. Vérifier les données et tests, committer seulement les changements attendus, pousser puis vérifier GitHub Pages. Fermer le collecteur et les onglets temporaires.

Les anciens fichiers CardTrader et leurs scripts restent disponibles pour l’audit historique des correspondances ; ils ne sont plus chargés par la valorisation.

Une association automatique Cardmarket n'est retenue que si une seule variante FR et un seul produit occidental correspondent dans l'édition, sans conflit entre séries, ou si une correspondance exacte a été vérifiée. L'ordre des suffixes Bandai (_p1, _p2…) et des identifiants Cardmarket ne garantit pas la même illustration. Cette règle s'applique aux **37 collections**, y compris aux anciennes associations sauvegardées : le code seul ne suffit plus à valider un choix enregistré. Un choix non confirmé est ignoré et signalé sur la fiche, sans supprimer la donnée personnelle. En cas d'ambiguïté, la fiche propose une recherche explicitement signalée et aucun lien produit ni prix automatique n'est attribué.

L’ancien collecteur CardTrader exigeait également des identifiants Cardmarket explicites. Elle refuse les fiches qui mélangent plusieurs codes, plusieurs produits d'une même édition ou des identifiants inconnus ; aucun repli par code seul n'est permis. Les nouveaux relevés enregistrent le blueprint CardTrader et le produit Cardmarket retenus. Les anciens relevés restent identifiés comme sans provenance dans l'audit : ils nécessitent une collecte complète pour contrôler cette étape, avant toute collecte partielle `--only`.

Les correspondances vérifiées individuellement dans `src/data/card-printings.json` sont également utilisables, après validation du code et de l'extension. Ce fichier documente les sources et distingue illustration d'origine, Jolly Roger, illustration étendue et illustration alternative pour les cartes contrôlées. Vergo PRB01 V.3 correspond à `OP03-079_p4` (produit 799250) ; Niji PRB01 V.3 à `OP06-065_p3` (produit 799370). Les autres correspondances restent inconnues tant qu'elles ne sont pas vérifiées. Ces métadonnées survivent aux reconstructions du catalogue et ne changent aucun identifiant de collection.

La revue du 14 octobre 2026 dans `src/data/printing-reviews.json` décrit les 634 impressions de PRB01/PRB02 et les 177 réimpressions des decks que le filtre « base » masquait à tort. Les 319 impressions PRB01 comprennent 104 versions de base identifiées ; sept codes n'y existent qu'en manga. Les 315 impressions uniques PRB02 comprennent 173 versions de base, sans confondre les parallèles de même illustration. Le site officiel y liste deux fois `ST20-003_p1` : une seule entrée est conservée. Les descriptions de finition ne créent aucune association de prix supplémentaire.

Les finitions PRB ne sont pas déduites de l'ordre des suffixes. Catalogue et cartes manquantes utilisent la même définition de « base » ; le plus petit suffixe ne suffit plus, notamment pour les mangas et SP présents seuls dans une série. Le scanner demande un choix explicite dès qu'un code possède plusieurs impressions dont une PRB, y compris si le résultat classé premier est l'édition d'origine. Une réimpression identique à l'original ne permet pas d'en déduire la provenance sur la seule image ; aucune édition fictive n'est créée pour la séparer. L'absence de relevé Cardmarket français valide reste affichée comme un prix indisponible, même lorsque le lien Cardmarket est confirmé.

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
3. Le workflow `.github/workflows/deploy.yml` construit le site et le publie à `https://<votre-compte>.github.io/optcg-fr/`. Il tourne aussi **chaque jour** pour rafraîchir le catalogue Cardmarket et son archive toutes langues (`prices.json` / `history.json`), sans prix FR. La collecte mensuelle des prix FR via Chrome est décrite plus haut.
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

L’ancienne collecte CardTrader conservait les annonces par fiche et par langue (archives uniquement, ignorées par la valorisation). Quand une fiche exacte a été identifiée, son prix prime sur l'agrégation par produit Cardmarket. Une fiche sans annonce française ne reprend jamais le prix anglais, japonais ou d'une autre finition. Une fiche identifiée sans lien Cardmarket peut fournir un prix CardTrader et une recherche Cardmarket, sans inventer de lien direct. Les réimpressions physiquement indissociables ou sans preuve suffisante restent non confirmées. Un premier relevé complet est obligatoire avant une actualisation partielle.

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
