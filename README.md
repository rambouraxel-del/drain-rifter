# Drain Rifter

**Drain Rifter** est un jeu mobile en portrait : une course infinie en 3D dans les entrailles d'une ville oubliée. Vous glissez le doigt pour éviter les obstacles, vous descendez le plus loin possible et vous essayez de battre votre record.

## Le jeu

- Une course sans fin dans un conduit en demi-tube. La vitesse augmente progressivement, de 15 m/s au départ jusqu'à 45 m/s.
- Le score est la distance parcourue, en mètres. Le meilleur score est conservé sur l'appareil.
- Le parcours traverse cinq zones aux ambiances différentes (voir plus bas).
- Une collision avec un obstacle met fin à la partie : l'écran de fin affiche la distance, le record et la zone atteinte.
- Au lancement d'une partie depuis le menu, une courte séquence d'introduction de 5,6 secondes est jouée. Elle peut être passée en touchant l'écran, avec Espace, Entrée ou Échap.

## Comment jouer

**Sur téléphone (tactile)** : glissez le doigt horizontalement. Le personnage suit le mouvement de votre doigt. La sensibilité se règle dans les paramètres.

**Au clavier** : flèches ← et →, ou A et D, ou Q et D (clavier AZERTY).

**À la souris** : maintenez le clic gauche et glissez horizontalement.

**Pause** : bouton en haut à gauche, touche Échap ou P. Le jeu se met aussi en pause si l'onglet du navigateur est masqué.

**Paramètres** (menu ou pause) : volume de la musique, volume des effets, sensibilité, qualité graphique (Auto, Bas, Moyen, Élevé) et affichage des images par seconde.

## Lancer le jeu en local

Prérequis : Node.js 18 ou plus récent (version LTS recommandée).

```
npm install
npm run dev
```

La commande `npm run dev` affiche une adresse réseau du type `http://192.168.x.x:5173/`. Ouvrez-la sur votre téléphone, connecté au même Wi-Fi que l'ordinateur.

## Build

- `npm run build` : produit le dossier `dist/`, un site statique à héberger.
- `npm run build:single` : produit `dist-single/index.html`, un fichier HTML unique et autonome.
- `npm run preview` : prévisualise le build de `dist/`.

## Tests

- `npm test` : lance les tests unitaires (Vitest, 8 fichiers, une centaine de tests). Ils couvrent la génération de la piste et l'équité des obstacles, les collisions, la physique du joueur, la sauvegarde et le générateur aléatoire.
- `npm run typecheck` : vérifie les types TypeScript.
- `node e2e/scenarios.mjs [url] [numéros]` : scénarios de non-régression navigateur (chargement, réglages, partie complète, record, clavier, plusieurs résolutions, longue session). Lancez d'abord le serveur de développement (`npx vite --port 5189`, puis l'URL correspondante). Le script rend `0` si tous les contrôles passent, et enregistre des captures dans `e2e/out/`. Les numéros permettent de ne lancer que certains scénarios, par exemple `1,3,5`. Il utilise Playwright, importé depuis le même chemin local que le script suivant.
- `node e2e/shot.mjs <url> <préfixe> [distances...]` : test navigateur. Il ouvre le jeu dans un écran de téléphone, prend des captures d'écran (dans `e2e/out/`, ignoré par Git), affiche l'état du jeu et les erreurs de console. Ce script utilise Playwright, importé depuis un chemin local (`/opt/node-tools/...`) qu'il faut adapter à votre machine.

## Structure du projet

| Dossier | Contenu |
|---|---|
| `src/core` | Boucle de jeu, états, entrées, réglages, qualité adaptative, constantes de réglage (`config.ts`) |
| `src/track` | Tracé de la piste, générateur de parcours et d'obstacles, vérification d'équité |
| `src/world` | Tunnel visuel, couleurs des zones, décor des cinq zones |
| `src/obstacles` | Cycle de vie des obstacles, collisions, modèles 3D |
| `src/player` | Physique du joueur et personnage |
| `src/fx` | Introduction, particules, lignes de vitesse |
| `src/audio` | Son généré en direct (Web Audio), musique et ambiances |
| `src/ui` | Menus, affichage en jeu, paramètres (HTML et CSS) |
| `tests` | Tests unitaires |
| `e2e` | Script de captures d'écran navigateur |
| `docs` | Documentation technique (`ARCHITECTURE.md`) |
| `AGENTS.md` | Règles de collaboration et répartition des fichiers |

## Les cinq zones

| Ordre | Zone | Ambiance |
|---|---|---|
| 1 | Les Égouts | Tube en béton, lampes en cage, tuyaux rouillés, grilles |
| 2 | Profondeurs Industrielles | Halls à nervures, poutres d'acier, ventilateurs, lumières orange |
| 3 | Les Cavernes | Parois de roche, cristaux lumineux, stalagmites |
| 4 | Les Ruines Oubliées | Colonnes brisées, arches, statues, runes, torches |
| 5 | L'Abîme | Îles flottantes, cristaux géants, brume |

Chaque zone dure environ 700 m, suivie d'une transition de 90 m vers la zone suivante. Après le premier cycle des cinq zones, l'ordre change (les Égouts restent en premier) et la difficulté augmente.

## Réglages et sauvegardes

Tout est stocké dans le navigateur de l'appareil (`localStorage`). Rien n'est envoyé sur un serveur.

- `drainrifter.settings.v1` : réglages (musique 60 %, effets 80 %, sensibilité ×1, qualité Auto, FPS masqués par défaut).
- `drainrifter.best.v1` : meilleur score.
- `drainrifter.stats.v1` : nombre de parties et distance cumulée.

En qualité Auto, le jeu réduit automatiquement la résolution et la distance d'affichage si la fréquence d'images baisse. Effacer les données du site dans le navigateur réinitialise tous ces éléments. En navigation privée, rien n'est conservé, mais le jeu fonctionne normalement.

## Lien jouable

Version jouable sur smartphone (artifact claude.ai privé, à partager depuis le menu Partager) :
https://claude.ai/artifact/8Zwvi6Tu5xnmbKJYKCwfwx — regénérer avec `npm run build:artifact` (fichier `dist-artifact/drain-rifter.html`).

## Limitations connues

- Performances mesurées uniquement en rendu logiciel (SwiftShader, sans GPU) : 15–45 FPS dans ces conditions, ~70–140 draw calls, 10–32 k triangles. Le 60 FPS sur vrai téléphone reste à confirmer ; la qualité « Auto » baisse automatiquement la résolution si le jeu rame.
- Audio 100 % procédural, jamais écouté par un humain : volumes et timbres à régler à l'oreille.
- Vu de dos, les jambes du personnage sont en partie masquées par le buste.
- Pas de vrai test sur iPhone/Android physique (seulement émulation mobile Chromium).
- Le personnage reste immobile une fraction de seconde à l'atterrissage de la cinématique avant la reprise du jeu.

