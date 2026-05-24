# Architecture - Billard 2D Multijoueur

## Stack

| Couche | Techno |
|---|---|
| Backend | NestJS + Prisma |
| Base de données | PostgreSQL |
| Bus inter-pods | Redis (Socket.io adapter) |
| Auth | JWT + Passport |
| Infra | Kubernetes (Minikube) |
| Ingress | Traefik Gateway API |

---

## Vue globale

```mermaid
graph TB
    A[Player A] -->|HTTP + WS| GW
    B[Player B] -->|HTTP + WS| GW

    GW[Traefik Gateway] --> P1 & P2

    subgraph Backend Deployment - N replicas
        P1[Pod 1] <-->|WS event routing| RD[(Redis\npub/sub bus)]
        RD <-->|WS event routing| P2[Pod 2]
    end

    P1 -->|read / write| PG[(PostgreSQL)]
    P2 -->|read / write| PG
```

---

## Routage WebSocket inter-pods

Le problème : Player A connecté sur Pod 1, Player B sur Pod 2. Sans coordination, Pod 1 ne peut pas atteindre le socket de Player B.

**Solution : Socket.io Redis adapter**

```mermaid
sequenceDiagram
    participant A as Player A (Pod 1)
    participant R as Redis
    participant B as Player B (Pod 2)

    A->>Pod 1: shoot { angle, power, x, y }
    Pod 1->>R: PUBLISH socket.io#/game#<roomId>
    R->>Pod 2: message reçu
    Pod 2->>B: opponent_shot { angle, power, x, y }
    B->>B: simulation déterministe locale
```

Le code NestJS reste identique quelle que soit la topologie des pods :
```ts
socket.to(roomId).emit('opponent_shot', shotParams);
```

---

## Responsabilités par composant

### PostgreSQL
Persistence de l'état du jeu. Écrit à chaque fin de tour.

Entités : `Game`, `Player`, `GamePlayer`, `Ball`, `GameBall`

### Redis
Uniquement le bus de messages pour le Socket.io adapter. Pas d'état applicatif stocké. Si Redis tombe, les joueurs perdent la synchro temps réel mais aucune donnée n'est perdue - reconnexion = état relu depuis PostgreSQL.

### Backend (NestJS)
- API REST : auth, lobby, état de partie
- WebSocket Gateway : événements de jeu en temps réel
- Validation des tirs et des règles métier
- Écriture en base à chaque fin de tour

---

## Composants Kubernetes

| Composant | Type | Replicas |
|---|---|---|
| Backend | Deployment | N (HPA) |
| PostgreSQL | StatefulSet | 1 + PVC |
| Redis | StatefulSet | 1 + PVC |

Le frontend est géré par une autre équipe.

---

## Flux d'une partie

```mermaid
sequenceDiagram
    participant PA as Player A
    participant PB as Player B
    participant API as Backend REST
    participant WS as Backend WS
    participant DB as PostgreSQL

    PA->>API: POST /games
    API->>DB: Game { status: WAITING }
    PB->>API: POST /games/:id/join
    API->>DB: GamePlayer x2, GameBall x16

    PA->>WS: join_room
    PB->>WS: join_room
    WS->>PA: game_started
    WS->>PB: game_started

    loop Chaque tour
        PA->>WS: shoot { angle, power, x, y }
        WS->>PB: opponent_shot { angle, power, x, y }
        PB->>PB: simulation locale
        PA->>WS: shot_resolved { positions, pocketed }
        WS->>DB: update GameBall, GamePlayer.isTurn
        WS->>PA: turn_changed
        WS->>PB: turn_changed
    end

    WS->>DB: Game { status: FINISHED }
    WS->>PA: game_over
    WS->>PB: game_over
```