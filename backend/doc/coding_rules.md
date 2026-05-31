# Cue & Balls - Coding Rules (Backend)

> Scope : NestJS 11 + Prisma 7 + TypeScript 5
> These rules are binding for all backend contributions.

---

## 1. Language & General

- **TypeScript strict mode** — no `any` except Prisma enum cast workarounds (explicitly commented)
- **English only** — all identifiers, comments, JSDoc, commit messages, error codes
- **No magic numbers or strings** — extract to named constants or enums
- **No barrel files** (`index.ts` re-exports) — import directly from the source file
- **No default exports** — named exports only, consistent with NestJS conventions

---

## 2. Project Structure

One file per class. File name matches class name in kebab-case :

```
GamesService      → games.service.ts
GameRulesService  → game-rules.service.ts
JwtAuthGuard      → jwt-auth.guard.ts
```

Modules are organized by feature, not by layer. No cross-feature imports except through module exports.

```
games.module.ts exports [GamesService, ShotService] → imported by nothing else
prisma.module.ts is @Global() → imported once in AppModule
```

---

## 3. Classes & SOLID

### Single Responsibility

Each class has one reason to change :

- `GamesController` / `GameGateway` : entry points only, no business logic
- `GamesService` : game lifecycle (create, join, pause, abandon)
- `ShotService` : shot orchestration (validate, persist, emit)
- `GameRulesService` : pure billiard rules, no I/O, no side effects

Never put persistence calls in a controller or gateway. Never put Socket.IO emit calls in a service — emit belongs in the gateway.

### Open/Closed

Extend behavior via new services or strategy classes, not by growing existing ones. If `GameRulesService` grows beyond its four methods, extract a dedicated class.

### Dependency Inversion

Always inject dependencies via constructor. Never instantiate services manually inside another class.

```ts
// correct
constructor(private readonly prisma: PrismaService) {}

// forbidden
const prisma = new PrismaService();
```

### Interface Segregation

Keep DTOs focused. One DTO per use case, do not reuse a DTO across endpoints if their shapes diverge even slightly.

---

## 4. NestJS Patterns

### Controllers & Gateways

Controllers and gateways are thin. Their only responsibilities :
- Declare the route/event binding via decorators
- Extract and validate the incoming payload (via DTOs + pipes)
- Call the appropriate service method
- Return or emit the result

No `if/else` business logic, no Prisma calls, no direct `socket.emit` in controllers.

### Services

Services own the business logic. They may call `PrismaService` and other services injected in their constructor. `ShotService` and `GamesService` may call `GameRulesService`. `GameRulesService` calls nothing — it is purely functional.

### DTOs

Every incoming payload (REST body, WS event payload) goes through a DTO class decorated with `class-validator` decorators. No raw `body: any` or untyped payloads.

```ts
export class ShootDto {
  @IsNumber()
  angle: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  power: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  cueBallX: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  cueBallY: number;
}
```

`ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` is registered globally in `main.ts`.

### Exception Handling

Use NestJS built-in HTTP exceptions for REST routes :

```ts
throw new NotFoundException('Game not found');
throw new BadRequestException('GAME_NOT_WAITING');
throw new ForbiddenException('NOT_YOUR_TURN');
```

For WebSocket errors, emit to the sender via the `error` event with a typed payload matching the WS contract :

```ts
client.emit('error', { code: 'NOT_YOUR_TURN', message: 'It is not your turn' });
return;
```

Never let a gateway method throw an unhandled exception — catch and emit `INTERNAL_ERROR`.

### Guards

`JwtAuthGuard` is applied globally via `APP_GUARD` in `AppModule`. Public routes (`/auth/register`, `/auth/login`) are decorated with a `@Public()` custom decorator that skips the guard.

---

## 5. Prisma Usage

Always use `PrismaService` injected via constructor. Never instantiate `PrismaClient` directly in a feature service.

Prefer explicit `select` or `include` over fetching full records when only a subset of fields is needed — keeps payloads lean and queries faster.

```ts
// preferred when only id and status are needed
const game = await this.prisma.game.findUnique({
  where: { id },
  select: { id: true, status: true },
});

// acceptable when the full relation is needed downstream
const game = await this.prisma.game.findUnique({
  where: { id },
  include: { gamePlayers: true, gameBalls: { include: { ball: true } } },
});
```

Wrap multi-step writes in a `prisma.$transaction()` to ensure atomicity :

```ts
await this.prisma.$transaction([
  this.prisma.gameBall.updateMany({ ... }),
  this.prisma.gamePlayer.updateMany({ ... }),
  this.prisma.game.update({ ... }),
]);
```

---

## 6. Documentation

### When to document

Comments are written **only when the code cannot speak for itself**. Do not comment what the code obviously does.

```ts
// forbidden — states the obvious
// update the game status
await this.prisma.game.update({ where: { id }, data: { status: 'FINISHED' } });

// useful — explains a non-obvious decision
// foul: cue ball is silently reset to spawn position instead of being flagged
// the front derives the foul from the corrected position in finalPositions
```

### JSDoc

JSDoc is required on all public methods of service classes. Use the following tags :

- `@param` for each parameter when the name alone is not self-explanatory
- `@returns` when the return value needs clarification
- `@throws` when the method throws a known exception

```ts
/**
 * Determines which player plays next after a shot.
 * The shooting player keeps the turn on a legal pocket; otherwise the turn passes.
 *
 * @param shooterId - ID of the player who just shot
 * @param opponentId - ID of the other player
 * @param pocketedNumbers - ball numbers pocketed this shot (may include cue ball)
 * @param isFoul - whether the shot was a foul (cue ball pocketed)
 * @returns the ID of the player who plays next
 */
resolveNextTurn(
  shooterId: string,
  opponentId: string,
  pocketedNumbers: number[],
  isFoul: boolean,
): string { ... }
```

No JSDoc on controllers, gateways, DTOs, or module files — their decorators are self-documenting.

No JSDoc on `PrismaService` — its methods are inherited from `PrismaClient`.

### Inline comments

Inline comments use `//` on the line above the relevant code, never at end of line. Written in English. Used sparingly.

---

## 7. Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Class | PascalCase | `GameRulesService` |
| Interface | PascalCase, no `I` prefix | `ShotResult` |
| Enum | PascalCase | `GameStatus` |
| Enum value | SCREAMING_SNAKE_CASE | `EIGHT_BALL_POCKETED` |
| Method / variable | camelCase | `resolveNextTurn` |
| File | kebab-case | `game-rules.service.ts` |
| DTO | PascalCase + `Dto` suffix | `ShootDto`, `ShotResolvedDto` |
| Guard | PascalCase + `Guard` suffix | `JwtAuthGuard` |
| Strategy | PascalCase + `Strategy` suffix | `JwtStrategy` |
| Decorator | PascalCase | `@Public()` |

Boolean variables and properties are prefixed with `is` or `has` :

```ts
isPocketed: boolean
isTurn: boolean
isFoul: boolean
```

---

## 8. TypeScript

Prefer `type` for shapes without methods, `interface` for shapes that may be extended or implemented :

```ts
// plain data shape → type
type BallPosition = { number: number; x: number; y: number };

// contract implemented by a class → interface
interface OnModuleInit { onModuleInit(): Promise<void> }
```

Avoid `!` non-null assertions — use explicit checks or early returns :

```ts
// forbidden
const game = await this.prisma.game.findUnique({ where: { id } });
game!.status;

// correct
const game = await this.prisma.game.findUnique({ where: { id } });
if (!game) throw new NotFoundException('Game not found');
game.status;
```

Use `readonly` on injected dependencies in constructors :

```ts
constructor(private readonly prisma: PrismaService) {}
```

---

## 9. Async

All service methods that touch the database or emit WebSocket events are `async` and return a `Promise`. No mixing of callbacks and promises.

Never use `await` on a value that is not a `Promise`. Never fire-and-forget async calls without handling the rejection :

```ts
// forbidden
this.someService.doSomething(); // unhandled promise

// correct
await this.someService.doSomething();
```

---

## 10. Error Codes

Business error codes are string literals matching the REST and WS contracts exactly. They live as `const` objects or string union types, not loose strings scattered across services :

```ts
export const WsErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  GAME_NOT_ONGOING: 'GAME_NOT_ONGOING',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type WsErrorCode = (typeof WsErrorCode)[keyof typeof WsErrorCode];
```