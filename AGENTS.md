# Drain Rifter — règles de collaboration (agents)

Architecture : voir `src/core/types.ts` (contrats partagés) et les commentaires CONTRACT en tête de chaque fichier.

- Track space : `s` = distance le long du spine (m), `u` = décalage latéral (m, + = droite).
- Repère local des objets (obstacles, personnage) : +x = droite piste, +y = normale surface, -z = avant.
- Les meshes gardent une géométrie LOCALE positionnée à une origine de chunk (précision float32).
- Matériaux/géométries partagés : `userData.shared = true` (sinon ils sont disposés).

Propriété des fichiers (ne modifiez QUE vos fichiers ; demandez au lead pour le reste) :
| Zone | Propriétaire |
|---|---|
| src/core/types.ts, src/core/Game.ts, src/main.ts | Lead |
| src/player/*, src/core/config.ts, src/core/difficulty.ts | Gameplay |
| src/world/* (sauf ChunkManager), src/world/decor/* | Environnements |
| src/track/TrackGenerator.ts, src/track/* (hors Spine profil) | Procédural |
| src/ui/*, src/fx/IntroCinematic.ts, src/core/Input.ts | UI/UX |
| src/fx/Particles.ts, src/core/Quality.ts, src/world/ChunkManager.ts, vite config | Intégration |
| src/obstacles/ObstacleFactory.ts, src/obstacles/props/* | Props (Haiku) |
| src/audio/* | Audio (Haiku) |
| tests/* | Tests (Haiku) |
| e2e/* | Tests navigateur (Haiku) |

Ne faites pas de commit git : le lead commit. Vérifiez `npx tsc --noEmit` sur vos fichiers.
Capture d'écran : `node e2e/shot.mjs http://localhost:<port>/ e2e/out/<nom> 800 2900` (lancer `npx vite --port <port>` d'abord).
