-- CreateEnum
CREATE TYPE "BallType" AS ENUM ('SOLIDS', 'STRIPES');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('WAITING', 'ONGOING', 'PAUSED', 'FINISHED', 'ABANDONED');

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "ballType" "BallType",
    "isTurn" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balls" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "BallType",
    "color" TEXT NOT NULL,

    CONSTRAINT "balls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_balls" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ballId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "isPocketed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "game_balls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_userName_key" ON "players"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "players_email_key" ON "players"("email");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_gameId_playerId_key" ON "game_players"("gameId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "balls_number_key" ON "balls"("number");

-- CreateIndex
CREATE UNIQUE INDEX "game_balls_gameId_ballId_key" ON "game_balls"("gameId", "ballId");

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_balls" ADD CONSTRAINT "game_balls_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_balls" ADD CONSTRAINT "game_balls_ballId_fkey" FOREIGN KEY ("ballId") REFERENCES "balls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
