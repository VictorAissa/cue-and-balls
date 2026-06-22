# Stage 1: build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Stage 2: run
FROM node:20-alpine AS runner

RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nestjs:nodejs /app/src/generated ./dist/src/generated

USER nestjs

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
