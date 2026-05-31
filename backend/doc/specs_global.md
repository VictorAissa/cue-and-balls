# Cue & Balls - Specs Projet

## Pitch

Jeu de billard 8-ball (variante américaine) en ligne, multijoueur 1v1, accessible via navigateur desktop. Comptes joueurs avec authentification JWT, parties en temps réel avec simulation physique déterministe côté client. Objectif technique central : déploiement résilient et hautement disponible sur Kubernetes, démarrable en une seule commande.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | ReactJS + moteur physique client (Matter.js ou Planck.js) |
| Backend | NestJS 11 |
| ORM | Prisma 7 |
| Base de données | PostgreSQL 16 |
| Bus inter-pods | Redis 7 (Socket.io adapter, pub/sub uniquement) |
| Auth | JWT + Passport (NestJS) |
| API | REST + WebSocket (Socket.IO) |
| Infra | Kubernetes (Minikube) |
| Ingress | Traefik Gateway API |

---

## Infrastructure

### Cluster

Kubernetes via Minikube (local, 1 noeud physique). Déploiement complet en une commande (`kubectl apply -k .`).

Accès DNS via nip.io (IP encodée dans le nom de domaine, sans configuration DNS) :

| Tier | URL |
|---|---|
| Frontend | `http://web.<ip>.nip.io` |
| Backend | `http://api.<ip>.nip.io` |

### Composants Kubernetes

| Composant | Type K8s | Replicas |
|---|---|---|
| Backend (NestJS) | Deployment + HPA | N |
| PostgreSQL | StatefulSet | 1 + PVC |
| Redis | StatefulSet | 1 + PVC |
| Frontend (ReactJS) | Deployment | N |

Le routage externe est assuré par la Gateway API (objets `Gateway` + `HTTPRoute`), implémentée par Traefik.

Le frontend est géré par une autre équipe.

### Vue globale

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

### Haute disponibilité

Plusieurs replicas backend. Si un pod crash, K8s le redémarre automatiquement. Le client reconnecte via retry WebSocket automatique.

Redis pub/sub pour le routage des événements WebSocket inter-pods : un événement émis sur un pod est reçu par tous les autres via le `@socket.io/redis-adapter`. Le code NestJS ne change pas selon la topologie des pods.

Si Redis tombe : les joueurs perdent la synchro temps réel mais aucune donnée n'est perdue. A la reconnexion, l'état est relu depuis PostgreSQL.

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

## Règles du billard (8-ball américain)

- 16 balles : blanche (0), pleines 1-7, noire (8), rayées 9-15
- Chaque joueur est assigné à un type (SOLIDS ou STRIPES) au premier empochage légal post-break
- Un joueur doit vider toutes ses balles avant de pouvoir empocher la noire
- Empocher la noire avant d'avoir vidé ses balles = défaite immédiate (`FOUL_ON_EIGHT`)
- Empocher la blanche = faute : tour à l'adversaire, blanche remise à la position de spawn
- Empocher une balle légalement = rejouer
- Manquer = tour à l'adversaire

---

## Cinématique complète

> `[REST]` = requête HTTP classique (requête/réponse)
> `[WS]` = événement Socket.IO (push serveur, pas de cycle requête/réponse)

```mermaid
sequenceDiagram
    participant PA as Player A
    participant SRV as Backend
    participant PB as Player B

    rect rgb(50, 70, 150)
        Note over PA,PB: Phase 1 — Authentification
        PA->>SRV: [REST] POST /auth/register { username, email, password }
        SRV-->>PA: 201 Player
        PA->>SRV: [REST] POST /auth/login { email, password }
        SRV-->>PA: 200 { accessToken }

        PB->>SRV: [REST] POST /auth/register { username, email, password }
        SRV-->>PB: 201 Player
        PB->>SRV: [REST] POST /auth/login { email, password }
        SRV-->>PB: 200 { accessToken }
    end

    rect rgb(40, 120, 70)
        Note over PA,PB: Phase 2 — Lobby + Connexions WebSocket
        PA->>SRV: [REST] POST /games
        Note right of SRV: game créée (WAITING)<br/>Player A enregistré comme GamePlayer
        SRV-->>PA: 201 { id }

        Note over PA: connexion WS immédiate après le 201
        PA->>SRV: [WS] connect /game (JWT)
        Note right of SRV: JWT décodé → playerId<br/>partie active trouvée en DB<br/>socket abonné au room
        SRV-->>PA: [WS] room_joined { game: WAITING, gamePlayers, gameBalls }

        PB->>SRV: [REST] GET /games?status=WAITING
        SRV-->>PB: 200 [ GameSummary ]

        PB->>SRV: [REST] POST /games/:id/join
        Note right of SRV: game → ONGOING<br/>Player B enregistré comme GamePlayer<br/>16 GameBalls créées (positions rack)
        SRV-->>PB: 204

        Note over PB: connexion WS immédiate après le 204
        PB->>SRV: [WS] connect /game (JWT)
        Note right of SRV: JWT décodé → playerId<br/>partie active trouvée en DB<br/>socket abonné au room<br/>les 2 joueurs sont connectés → démarrage
        SRV-->>PB: [WS] room_joined { game: ONGOING, gamePlayers, gameBalls }
        SRV-->>PA: [WS] game_started { firstTurnPlayerId: A, players: [A, B] }
        SRV-->>PB: [WS] game_started { firstTurnPlayerId: A, players: [A, B] }
    end

    rect rgb(150, 110, 20)
        Note over PA,PB: Phase 3 — Tour de jeu (A tire, rate — tour passe à B)
        PA->>SRV: [WS] shoot { angle, power, cueBallX, cueBallY }
        SRV-->>PB: [WS] opponent_shot { angle, power, cueBallX, cueBallY }

        Note over PA: simulation physique locale
        Note over PB: simulation physique locale (mêmes params → même résultat)

        PA->>SRV: [WS] shot_resolved { pocketedNumbers: [], finalPositions }
        Note right of SRV: aucune boule empochée → tour passe à B<br/>persist GameBalls + GamePlayer.isTurn
        SRV-->>PA: [WS] shot_result { pocketedNumbers: [], finalPositions, nextTurnPlayerId: B }
        SRV-->>PB: [WS] shot_result { pocketedNumbers: [], finalPositions, nextTurnPlayerId: B }
    end

    rect rgb(40, 110, 90)
        Note over PA,PB: Phase 4 — Tour de jeu (B empoche une pleine → assignation des types + B rejoue)
        PB->>SRV: [WS] shoot { angle, power, cueBallX, cueBallY }
        SRV-->>PA: [WS] opponent_shot { angle, power, cueBallX, cueBallY }

        Note over PA: simulation physique locale
        Note over PB: simulation physique locale

        PB->>SRV: [WS] shot_resolved { pocketedNumbers: [3], finalPositions }
        Note right of SRV: boule 3 empochée (pleine)<br/>premier empochage légal post-break<br/>B → SOLIDS, A → STRIPES<br/>boule empochée légalement → B rejoue
        SRV-->>PA: [WS] shot_result { pocketedNumbers: [3], finalPositions, nextTurnPlayerId: B, ballTypesAssigned: { solids: B, stripes: A } }
        SRV-->>PB: [WS] shot_result { pocketedNumbers: [3], finalPositions, nextTurnPlayerId: B, ballTypesAssigned: { solids: B, stripes: A } }
    end

    rect rgb(140, 40, 60)
        Note over PA,PB: Phase 5 — Faute (B empoche la blanche)
        PB->>SRV: [WS] shoot { angle, power, cueBallX, cueBallY }
        SRV-->>PA: [WS] opponent_shot { angle, power, cueBallX, cueBallY }

        PB->>SRV: [WS] shot_resolved { pocketedNumbers: [0], finalPositions }
        Note right of SRV: boule 0 dans pocketedNumbers → faute<br/>blanche remise à sa position initiale<br/>tour passe à A
        SRV-->>PA: [WS] shot_result { pocketedNumbers: [0], finalPositions (blanche à spawn), nextTurnPlayerId: A }
        SRV-->>PB: [WS] shot_result { pocketedNumbers: [0], finalPositions (blanche à spawn), nextTurnPlayerId: A }
    end

    rect rgb(80, 50, 150)
        Note over PA,PB: Phase 6 — Déconnexion & reconnexion (Player B)
        Note over PB: perte de connexion réseau
        SRV-->>PA: [WS] player_left { playerId: B }
        Note right of SRV: timer de reconnexion démarré (TTL)

        Note over PB: reconnexion
        PB->>SRV: [REST] GET /games/:id
        SRV-->>PB: 200 GameDetail (état persisté en base)

        PB->>SRV: [WS] connect /game (JWT)
        Note right of SRV: timer annulé — partie reprise
        SRV-->>PB: [WS] room_joined (état courant)
    end

    rect rgb(140, 100, 20)
        Note over PA,PB: Phase 7 — Fin de partie (A empoche la noire légalement)
        PA->>SRV: [WS] shoot { angle, power, cueBallX, cueBallY }
        SRV-->>PB: [WS] opponent_shot { angle, power, cueBallX, cueBallY }

        PA->>SRV: [WS] shot_resolved { pocketedNumbers: [8], finalPositions }
        Note right of SRV: boule 8 empochée, toutes les rayées de A vidées<br/>victoire A — game → FINISHED
        SRV-->>PA: [WS] shot_result { pocketedNumbers: [8], finalPositions, nextTurnPlayerId: A }
        SRV-->>PB: [WS] shot_result { pocketedNumbers: [8], finalPositions, nextTurnPlayerId: A }
        SRV-->>PA: [WS] game_over { winnerId: A, reason: EIGHT_BALL_POCKETED }
        SRV-->>PB: [WS] game_over { winnerId: A, reason: EIGHT_BALL_POCKETED }
    end
```

---

## Hors scope MVP

- Mobile (PWA envisageable ultérieurement)
- Historique des parties
- Classement / ELO
- Variante française du billard
- Refresh token (JWT access token uniquement)