# Cue & Balls - Backend

API REST + WebSocket pour un jeu de billard 8-ball multijoueur en ligne. NestJS 11 + Prisma 7 + PostgreSQL + Redis, brique backend.

---

## Prérequis

- Node.js 22+
- Docker

---

## Installation

```bash
npm i
```

---

## Infrastructure locale

```bash
# PostgreSQL
docker run -d \
  --name cueballs-postgres \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin \
  -e POSTGRES_DB=main \
  -p 5432:5432 \
  -v cueballs-postgres-data:/var/lib/postgresql/data \
  postgres:16-alpine

# Redis (pub/sub Socket.IO inter-pods)
docker run -d \
  --name cueballs-redis \
  -p 6379:6379 \
  -v cueballs-redis-data:/data \
  redis:7-alpine
```

---

## Variables d'environnement

Créer un `.env` à la racine :

```env
DATABASE_URL="postgresql://admin:admin@localhost:5432/main"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="changeme"
JWT_EXPIRES_IN="1d"
```

---

## Base de données

```bash
# Générer le client Prisma
npx prisma generate

# Appliquer les migrations
npx prisma migrate dev

# Seed : insérer les 16 balles statiques
npx prisma db seed
```

---

## Lancer l'application

```bash
# Développement (watch mode)
npm run start:dev

# Production
npm run build && npm run start:prod
```

trigger