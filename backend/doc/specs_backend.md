# Cue & Balls - Specs Backend

## Architecture

### Modules NestJS

| Module | Responsabilité |
|---|---|
| `PrismaModule` | Gestion du cycle de vie de la connexion DB, exporté globalement |
| `AuthModule` | Register, login, stratégie JWT, guards |
| `PlayersModule` | Profil joueur authentifié |
| `GamesModule` | Lifecycle des parties (REST) + événements temps réel (WebSocket) |

### Découpage GamesModule

Le `GamesModule` est le coeur du projet. Deux points d'entrée sur le même service :

```
GamesController  (HTTP)  --|
                           |--> GamesService / ShotService --> PrismaService
GameGateway      (WS)   --|
                           --> GameRulesService (stateless, logique billard pure)
```

| Classe | Rôle |
|---|---|
| `GamesController` | Points d'entrée REST (lobby, création, join, état) |
| `GameGateway` | Points d'entrée WebSocket (connexion, tirs, pause, départ) |
| `GamesService` | Lifecycle : create, join, pause, resume, abandon |
| `ShotService` | Orchestration d'un tir : validation, persistance, émission |
| `GameRulesService` | Règles billard pures, stateless, testable unitairement |

### Responsabilités par composant

**PostgreSQL** : persistence de l'état du jeu. Écrit à chaque fin de tour.
Entités : `Game`, `Player`, `GamePlayer`, `Ball`, `GameBall`

**Redis** : uniquement le bus de messages pour le Socket.io adapter. Pas d'état applicatif stocké. Si Redis tombe, les joueurs perdent la synchro temps réel mais aucune donnée n'est perdue — reconnexion = état relu depuis PostgreSQL.

**Backend (NestJS)** :
- API REST : auth, lobby, état de partie
- WebSocket Gateway : événements de jeu en temps réel
- Validation des tirs et des règles métier
- Écriture en base à chaque fin de tour

### Adaptateur Redis

Classe `RedisIoAdapter` (hors modules NestJS) instanciée dans `main.ts`. Etend `IoAdapter` de NestJS, connecte deux clients Redis (pub + sub), attache le `@socket.io/redis-adapter` au serveur Socket.IO. Transparent pour le reste du code applicatif.

---

## Arborescence

```
src/
├── auth/
│   ├── dto/
│   │   ├── register.dto.ts
│   │   └── login.dto.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── auth.controller.ts
│   │   # POST /auth/register, POST /auth/login
│   ├── auth.service.ts
│   │   # register: hash password + create Player
│   │   # login: validate credentials + sign JWT
│   └── auth.module.ts
│
├── players/
│   ├── dto/
│   │   └── update-player.dto.ts
│   ├── players.controller.ts
│   │   # GET /players/me, PATCH /players/me
│   ├── players.service.ts
│   │   # findMe: fetch authenticated player profile
│   │   # updateMe: update username or avatar
│   └── players.module.ts
│
├── games/
│   ├── dto/
│   │   ├── shoot.dto.ts
│   │   └── shot-resolved.dto.ts
│   ├── services/
│   │   ├── games.service.ts
│   │   │   # createGame: create Game + register caller as first GamePlayer
│   │   │   # joinGame: register second GamePlayer + init 16 GameBalls + set ONGOING
│   │   │   # listGames: fetch games filtered by status for lobby
│   │   │   # getGame: fetch full game state (Game + GamePlayers + GameBalls) for reconnection
│   │   │   # pauseGame: set PAUSED + persist
│   │   │   # resumeGame: set ONGOING + persist
│   │   │   # abandonGame: set ABANDONED + notify opponent via game_over
│   │   ├── shot.service.ts
│   │   │   # processShoot: validate turn ownership + forward opponent_shot to the other player
│   │   │   # processShotResolved: orchestrate rules check + persist GameBalls state + emit shot_result to both + trigger game_over if needed
│   │   └── game-rules.service.ts
│   │       # isFoul: detect whether cue ball (number 0) was pocketed
│   │       # resolveNextTurn: compute next turn player (same if legal pocket, opponent on miss or foul)
│   │       # assignBallTypes: assign SOLIDS/STRIPES on first legal non-eight pocket after break
│   │       # isGameOver: check win condition (eight pocketed after clearing own balls) or loss (eight pocketed too early)
│   ├── games.controller.ts
│   │   # POST /games
│   │   # GET /games?status=
│   │   # GET /games/:id
│   │   # POST /games/:id/join
│   ├── games.gateway.ts
│   │   # handleConnection: decode JWT + find active game + join Socket.io room
│   │   # handleDisconnect: emit player_left + start reconnection TTL timer
│   │   # shoot: delegate to ShotService.processShoot
│   │   # shot_resolved: delegate to ShotService.processShotResolved
│   │   # pause_request: delegate to GamesService.pauseGame
│   │   # resume_request: delegate to GamesService.resumeGame
│   │   # leave_game: delegate to GamesService.abandonGame
│   └── games.module.ts
│
├── prisma/
│   ├── prisma.service.ts
│   │   # extends PrismaClient
│   │   # onModuleInit: open database connection
│   │   # onModuleDestroy: close database connection
│   └── prisma.module.ts
│       # global module, exports PrismaService to all modules
│
├── adapters/
│   └── redis-io.adapter.ts
│       # extends IoAdapter
│       # connectToRedis: establish Redis pub/sub connections
│       # createIOServer: attach @socket.io/redis-adapter for cross-pod WS event routing
│
└── app.module.ts
    # root module, imports all feature modules

prisma/
├── schema.prisma
├── prisma.config.ts
└── seed.ts
    # inserts the 16 static Ball rows (number, type, color)
```

---

## Modèle de données

### Entités

**Player** : compte joueur. `userName` et `email` uniques.

**Game** : une partie. Statuts : `WAITING` | `ONGOING` | `PAUSED` | `FINISHED` | `ABANDONED`.

**GamePlayer** : liaison joueur/partie. Porte `ballType` (null jusqu'à assignation post-break) et `isTurn`.

**Ball** : données statiques, seedées à l'init (16 lignes fixes). `type` null pour la blanche (0) et la noire (8).

**GameBall** : état d'une balle dans une partie. Positions normalisées `[0,1]`, `isPocketed`.

### Schema Prisma

```prisma
model Game {
  id          String     @id @default(uuid())
  status      GameStatus @default(WAITING)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  gamePlayers GamePlayer[]
  gameBalls   GameBall[]
}

model Player {
  id           String       @id @default(uuid())
  userName     String       @unique
  email        String       @unique
  passwordHash String
  createdAt    DateTime     @default(now())
  gamePlayers  GamePlayer[]
}

model GamePlayer {
  id       String    @id @default(uuid())
  gameId   String
  playerId String
  ballType BallType?
  isTurn   Boolean   @default(false)
  game     Game      @relation(fields: [gameId], references: [id], onDelete: Cascade)
  player   Player    @relation(fields: [playerId], references: [id])
  @@unique([gameId, playerId])
}

model Ball {
  id        String    @id @default(uuid())
  number    Int       @unique  // 0=blanche, 1-7=pleines, 8=noire, 9-15=rayées
  type      BallType?           // null pour 0 et 8
  color     String
  gameBalls GameBall[]
}

model GameBall {
  id         String  @id @default(uuid())
  gameId     String
  ballId     String
  x          Float
  y          Float
  isPocketed Boolean @default(false)
  game       Game    @relation(fields: [gameId], references: [id], onDelete: Cascade)
  ball       Ball    @relation(fields: [ballId], references: [id])
  @@unique([gameId, ballId])
}

enum BallType   { SOLIDS  STRIPES }
enum GameStatus { WAITING  ONGOING  PAUSED  FINISHED  ABANDONED }
```

### Positions normalisées

Toutes les coordonnées de balles sont normalisées `[0,1]` sur les deux axes pour être indépendantes de la résolution d'affichage. Le frontend et le backend s'accordent sur ce référentiel.

---

## API REST

Base URL : `http://api.<ip>.nip.io`

Authentification : `Authorization: Bearer <accessToken>` sur toutes les routes sauf auth.

### Auth

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Non | Création de compte |
| POST | `/auth/login` | Non | Login, retourne `{ accessToken }` |

### Players

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/players/me` | Oui | Profil du joueur authentifié |
| PATCH | `/players/me` | Oui | Mise à jour username / avatar |

### Games

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/games` | Oui | Créer une partie (statut WAITING) |
| GET | `/games?status=` | Oui | Lister les parties (lobby, défaut WAITING) |
| GET | `/games/:id` | Oui | Etat complet d'une partie (reconnexion) |
| POST | `/games/:id/join` | Oui | Rejoindre une partie, init 16 GameBalls |

### Codes d'erreur métier

`USERNAME_TAKEN` | `EMAIL_TAKEN` | `PLAYER_ALREADY_IN_GAME` | `ALREADY_PARTICIPANT` | `GAME_FULL` | `GAME_NOT_WAITING` | `UNAUTHORIZED` | `NOT_FOUND` | `VALIDATION_ERROR`

---

## API WebSocket

Namespace Socket.IO : `/game`

Authentification : JWT passé dans le handshake auth :
```js
const socket = io('/game', { auth: { token: 'Bearer <accessToken>' } })
```

A la connexion, le serveur décode le JWT, trouve la partie active du joueur en DB, abonne le socket au room correspondant (game id). Pas d'événement `join` explicite côté client.

### Quand se connecter

- **Player A** (créateur) : immédiatement après `POST /games` 201
- **Player B** (rejoignant) : immédiatement après `POST /games/:id/join` 204

### Protocole de tir

La simulation physique tourne côté client (déterministe).

1. Le tireur émet `shoot` avec angle, puissance, position blanche
2. Le serveur valide le tour, émet `opponent_shot` à l'adversaire
3. Les deux clients simulent localement depuis les mêmes paramètres
4. Le tireur émet `shot_resolved` quand toutes les balles sont arrêtées
5. Le serveur valide les règles, persiste, émet `shot_result` aux deux joueurs

### Gestion des fautes

Si la blanche (numéro 0) apparait dans `shot_resolved.pocketedNumbers` : faute. Le serveur remet silencieusement la blanche à sa position de spawn et passe le tour à l'adversaire. Pas de champ `foul` exposé, le front reçoit les positions corrigées et le prochain joueur calculé.

### Evénements Client -> Serveur

| Evénement | Payload | Description |
|---|---|---|
| `shoot` | `{ angle, power, cueBallX, cueBallY }` | Soumettre un tir (seulement si c'est le tour du joueur) |
| `shot_resolved` | `{ pocketedNumbers, finalPositions }` | Résultat de simulation côté client |
| `pause_request` | - | Demander la pause (les deux joueurs peuvent) |
| `resume_request` | - | Reprendre la partie pausée |
| `leave_game` | - | Quitter volontairement (game_over pour l'adversaire) |

### Evénements Serveur -> Client

| Evénement | Destinataire | Description |
|---|---|---|
| `room_joined` | Connectant | Etat complet de la partie à la connexion |
| `game_started` | Les deux | Les deux joueurs sont connectés, la partie commence |
| `opponent_shot` | Non-tireur | Paramètres du tir pour simulation locale |
| `shot_result` | Les deux | Résultat autoritaire du tir, prochain tour |
| `player_left` | Les deux | Un joueur s'est déconnecté |
| `game_paused` | Les deux | Partie mise en pause |
| `game_resumed` | Les deux | Partie reprise |
| `game_over` | Les deux | Fin de partie avec gagnant et raison |
| `error` | Emetteur | Rejet d'un événement par le serveur |

### Raisons de fin de partie (`game_over.reason`)

| Valeur | Description |
|---|---|
| `EIGHT_BALL_POCKETED` | Vainqueur a empoché la noire légalement |
| `FOUL_ON_EIGHT` | Joueur a empoché la noire avant de vider ses balles |
| `OPPONENT_LEFT` | L'adversaire a émis `leave_game` |
| `OPPONENT_DISCONNECTED` | L'adversaire n'a pas reconnecté dans le TTL |

### Codes d'erreur WS

`UNAUTHORIZED` | `GAME_NOT_FOUND` | `NOT_YOUR_TURN` | `GAME_NOT_ONGOING` | `INTERNAL_ERROR`

---

## Persistance et résilience

### Ce qui est persisté

L'état de la partie est écrit en base à chaque fin de tour (`shot_resolved` traité) : positions des GameBalls, `isTurn` des GamePlayers, statut de la Game. Pas de persistance intermédiaire pendant le vol de la balle.

### Redis

Uniquement le bus de messages pour le Socket.io adapter. Aucun état applicatif stocké dans Redis. Redis n'est pas un cache, c'est un relais d'événements entre pods.

### Reconnexion

1. Le client perd la connexion WS
2. Le serveur émet `player_left` à l'adversaire et démarre un timer (TTL)
3. Le client reconnectant appelle `GET /games/:id` pour récupérer l'état depuis PostgreSQL
4. Le client se reconnecte en WS, le serveur annule le timer et émet `room_joined`
5. Si le TTL expire avant reconnexion : `game_over` avec `reason: OPPONENT_DISCONNECTED`

---

## Variables d'environnement

| Variable | Description | Exemple |
|---|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL | `postgresql://billard:billard@localhost:5432/billard` |
| `REDIS_URL` | URL de connexion Redis | `redis://localhost:6379` |
| `JWT_SECRET` | Secret de signature des tokens JWT | `changeme` |
| `JWT_EXPIRES_IN` | Durée de validité des tokens | `1d` |

En production K8s, ces variables seront injectées via `Secret` Kubernetes.