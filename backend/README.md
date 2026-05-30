# Cue&Balls

## DB container

```bash
docker run -d \
--name cueballs-postgres \
-e POSTGRES_USER=admin \
-e POSTGRES_PASSWORD=admin \
-e POSTGRES_DB=main \
-p 5432:5432 \
-v cueballs-postgres-data:/var/lib/postgresql/data \
postgres:16-alpine
```

## Project Structure

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
│       # connectToRedis: establish Redis connection
│       # createIOServer: attach @socket.io/redis-adapter for cross-pod WS event routing
│
└── app.module.ts
    # root module, imports all feature modules

prisma/
├── schema.prisma
└── seed.ts
    # inserts the 16 static Ball rows (number, type, color)
```