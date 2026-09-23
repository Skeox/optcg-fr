# Sauvegarde privée OPTCG FR avec Turso

La base Turso dédiée est `optcg-fr-backup`, dans le groupe `one-piece-tcg` de l’organisation `skeox`. Le site statique (GitHub Pages/PWA) appelle un petit service Node HTTPS. **La clé Turso reste exclusivement côté serveur.** La clé de récupération personnelle permet seulement d’utiliser ce service de sauvegarde, sans accès SQL direct.

## Données sauvegardées

- Collection : cartes, quantités et notes.
- Associations manuelles de produits Cardmarket, prix VF saisis, nombre d’exemplaires à garder.
- 30 versions précédentes du document, conservées dans `optcg_backup_history`.

Le catalogue, les images et les historiques publics de prix ne sont pas copiés : ils sont téléchargés à nouveau par l’application. Les instantanés locaux de prix restent dans l’export JSON manuel.

## Installation du service

1. Installer Node 20.20+ et les dépendances (`npm ci`).
2. Exécuter `npm run backup:setup`. Cette commande crée **une seule fois** `server/.env.local` et `server/recovery.local.json`, exclus de Git. Conserver le fichier de récupération dans un emplacement privé, hors du navigateur.
3. Créer un jeton Turso lecture/écriture pour **cette base uniquement**. Le renseigner dans `TURSO_AUTH_TOKEN` dans `server/.env.local`. Ne jamais utiliser un jeton d’organisation ni une variable `VITE_*` pour un secret.
4. Exécuter `npm run backup:server`. Le schéma est initialisé de façon idempotente. En local, le service écoute sur `http://127.0.0.1:8787`.
5. Dans *Plus → Réglages → Sauvegarde automatique*, charger `server/recovery.local.json`, vérifier l’adresse puis cliquer sur **Connecter et restaurer**.

## Hébergement pour le mobile

### Service Vercel en production

Adresse : `https://optcg-fr-backup.vercel.app`. Projet `optcg-fr-backup`, espace Vercel `greg-07a1` (Hobby). Le site reste sur `https://skeox.github.io/optcg-fr/`.

Le service est déployé indépendamment du dépôt GitHub. Pour publier une modification serveur :

1. Exécuter `npm test`, `npm run backup:check`, puis `npm run backup:build`.
2. Depuis `.cache/backup-vercel`, exécuter `npx vercel deploy --prod --scope greg-07a1` avec le compte `skeox`. Lors d'une première installation sur un autre PC, utiliser d'abord `npx vercel link --project optcg-fr-backup --scope greg-07a1`.
3. Vérifier `/sync` avec la clé de récupération : une requête POST authentifiée doit réussir ; une requête sans clé doit renvoyer 401.

Le build ne copie que le service compilé, ses dépendances déclarées, une page d'accueil et la configuration Vercel. Les quatre variables `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BACKUP_ACCESS_KEY_HASH`, `BACKUP_ALLOWED_ORIGINS` sont stockées comme secrets Vercel dans l'environnement **Production**. Le schéma Turso doit être initialisé avec `server/schema.sql` avant le premier déploiement ; il existe déjà sur la base actuelle.

`server/recovery.production.local.json` contient l'adresse HTTPS et la clé personnelle, à conserver hors du navigateur et à importer une fois sur chaque appareil. Ce fichier privé est exclu de Git. L'application préremplit l'adresse du service ; `VITE_BACKUP_API_URL` permet de la remplacer au build. Ne jamais y mettre la clé.

### Autre hébergement Node

Turso héberge la base, mais pas ce service Node. Héberger `server/index.ts` sur un serveur Node avec HTTPS, indépendamment de GitHub Pages. Commande de démarrage en production : `node --import tsx server/index.ts` ; définir les variables de `server/.env.example` dans le gestionnaire de secrets de l’hébergeur. `BACKUP_HOST=0.0.0.0` convient à un conteneur derrière un proxy HTTPS.

Remplacer `BACKUP_ALLOWED_ORIGINS` par les origines exactes autorisées, séparées par des virgules : par exemple `https://votre-compte.github.io` (sans chemin) et, si nécessaire, `capacitor://localhost`. Aucun joker. L’accès nécessite toujours la clé privée même depuis une origine autorisée. Lier le site à l’URL publique du service dans les réglages ; `VITE_BACKUP_API_URL` peut préremplir uniquement cette URL publique lors du build.

Mettre à jour le champ `url` du fichier de récupération avec l’adresse HTTPS publique. Ne pas recopier la clé Turso dans ce fichier : seule la clé d’accès personnelle au service y figure. Le service peut être déplacé sans perdre les cartes tant qu’il utilise la même base Turso et le même hash de clé.

## Fonctionnement et garanties

Chaque modification utilisateur est enregistrée dans la même transaction IndexedDB que son opération à envoyer. L’application envoie les opérations après environ 250 ms, reprend au retour du réseau et vérifie le cloud toutes les 15 secondes lorsqu’elle est visible. Un verrou partagé entre les onglets empêche deux envois locaux simultanés ; il expire après une minute en cas d’arrêt brutal.

Le service applique un lot dans une transaction Turso et conserve les identifiants d’opérations déjà traitées. Une réponse réseau perdue n’entraîne donc pas de double comptage lors de la reprise. Les ajouts de plusieurs appareils s’additionnent. Une réponse reçue pendant de nouveaux ajouts locaux est fusionnée avec les opérations encore en attente.

Au premier raccordement, les cartes anciennes sont fusionnées en gardant la quantité la plus grande pour un code présent des deux côtés (pas de doublement d’une même copie). Les nouveaux ajouts journalisés sont ensuite envoyés normalement. Un appareil vide **restaure le cloud, sans le remplacer par une collection vide**. Une suppression volontaire faite dans l’application est en revanche synchronisée. Le retrait porte sur les exemplaires connus localement ; il ne supprime pas les ajouts inconnus d’un autre appareil.

L’indication **Sauvegarde confirmée** signifie que le serveur a répondu après validation de sa transaction. Les ajouts effectués hors connexion et non encore confirmés restent vulnérables si les données du navigateur sont effacées avant leur envoi. Aucun site ne peut sauvegarder à distance sans réseau.

Après suppression des cookies/données du site : rouvrir l’application, charger le fichier de récupération et se connecter. Garder ce fichier privé ; une personne qui le possède peut lire et modifier la collection via le service. Si le jeton Turso expire, renouveler celui-ci côté serveur ; la clé personnelle et la collection restent inchangées.

Pour une restauration d’une version précédente après une suppression volontaire, exporter le JSON `data` de la révision voulue depuis `optcg_backup_history`, puis convertir ses maps en listes `collection`, `overrides`, `vfPrices` dans le format d’export manuel de l’application. Importer cette copie depuis Réglages. Ne pas diminuer directement `revision` ni effacer `optcg_backup_operations` : ces informations protègent contre les replays et les réponses anciennes.

## Vérification

`npm test` couvre notamment les transactions locales, la reprise après erreur réseau, les modifications pendant l’envoi, la restauration d’un appareil vide, les ajouts de plusieurs appareils, les autorisations HTTP et la rétention d’historique. Les tests utilisent le même pilote libSQL avec une base SQLite en mémoire.

`npm run backup:check` vérifie les types du serveur ; `npm run build` construit le site. L’activation réelle sur mobile exige que le service HTTPS soit hébergé et accessible.
