import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GameStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CUE_BALL_SPAWN, RACK_POSITIONS } from '../constants/rack-positions';
import { ListGamesDto } from '../dto/list-games.dto';

const ACTIVE_GAME_STATUSES: GameStatus[] = [GameStatus.WAITING, GameStatus.ONGOING, GameStatus.PAUSED];

const GAME_DETAIL_INCLUDE = {
    gamePlayers: {
        include: {
            player: {
                select: { id: true, userName: true, createdAt: true },
            },
        },
    },
    gameBalls: {
        include: {
            ball: {
                select: { id: true, number: true, type: true, color: true },
            },
        },
    },
} satisfies Prisma.GameInclude;

@Injectable()
export class GamesService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Creates a new WAITING game and registers the caller as the first GamePlayer.
     * If the player is already in active games, they are abandoned first.
     *
     * @param playerId - ID of the authenticated player
     * @returns the created game ID
     */
    async createGame(playerId: string): Promise<{ id: string }> {
        await this.abandonActiveGamesForPlayer(playerId);

        const game = await this.prisma.game.create({
            data: {
                gamePlayers: {
                    create: { playerId },
                },
            },
            select: { id: true },
        });

        return { id: game.id };
    }

    /**
     * Joins an existing WAITING game as the second player.
     * Initializes the 16 GameBalls at rack positions.
     * The game starts only once both players are connected to the websocket room.
     * Throws 404 if the game does not exist.
     * Throws 400 if the game is not WAITING or already full.
     * Throws 409 if the player is already a participant of this game.
     *
     * @param gameId - ID of the game to join
     * @param playerId - ID of the authenticated player
     */
    async joinGame(gameId: string, playerId: string): Promise<void> {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
            include: { gamePlayers: true },
        });

        if (!game) throw new NotFoundException('NOT_FOUND');
        if (game.status !== GameStatus.WAITING) throw new BadRequestException('GAME_NOT_WAITING');

        const alreadyParticipant = game.gamePlayers.some((gp) => gp.playerId === playerId);
        if (alreadyParticipant) throw new ConflictException('ALREADY_PARTICIPANT');

        if (game.gamePlayers.length >= 2) throw new BadRequestException('GAME_FULL');

        await this.abandonActiveGamesForPlayer(playerId, gameId);

        const balls = await this.prisma.ball.findMany({ select: { id: true, number: true } });
        const allPositions = [CUE_BALL_SPAWN, ...RACK_POSITIONS];

        await this.prisma.$transaction([
            this.prisma.gamePlayer.create({
                data: { gameId, playerId },
            }),
            this.prisma.gameBall.createMany({
                data: balls.map((ball) => {
                    const position = allPositions.find((p) => p.number === ball.number)!;
                    return {
                        gameId,
                        ballId: ball.id,
                        x: position.x,
                        y: position.y,
                    };
                }),
            }),
            this.prisma.gamePlayer.updateMany({
                where: { gameId, playerId: { not: playerId } },
                data: { isTurn: true },
            }),
        ]);
    }

    /**
     * Returns a list of games filtered by status for the lobby.
     * Defaults to WAITING games.
     *
     * @param dto - query params with optional status filter
     */
    async listGames(dto: ListGamesDto) {
        const games = await this.prisma.game.findMany({
            where: { status: dto.status },
            include: {
                gamePlayers: {
                    include: {
                        player: { select: { userName: true, createdAt: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return games.map((game) => ({
            game: {
                id: game.id,
                status: game.status,
                createdAt: game.createdAt,
                updatedAt: game.updatedAt,
            },
            players: game.gamePlayers.map((gp) => ({
                username: gp.player.userName,
                createdAt: gp.player.createdAt,
            })),
        }));
    }

    /**
     * Returns the full state of a game including players and ball positions.
     * Used for reconnection flow.
     *
     * @param gameId - ID of the game
     * @throws NotFoundException if the game does not exist
     */
    async getGame(gameId: string) {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
            include: GAME_DETAIL_INCLUDE,
        });

        if (!game) throw new NotFoundException('NOT_FOUND');

        return this.formatGameDetail(game);
    }

    /**
     * Sets the game status to PAUSED.
     *
     * @param gameId - ID of the game to pause
     * @param playerId - ID of the player requesting the pause
     * @returns the playerId for broadcasting in the gateway
     */
    async pauseGame(gameId: string, playerId: string): Promise<{ byPlayerId: string }> {
        await this.prisma.game.update({
            where: { id: gameId },
            data: { status: GameStatus.PAUSED },
        });

        return { byPlayerId: playerId };
    }

    /**
     * Sets the game status back to ONGOING.
     *
     * @param gameId - ID of the game to resume
     */
    async resumeGame(gameId: string): Promise<void> {
        await this.prisma.game.update({
            where: { id: gameId },
            data: { status: GameStatus.ONGOING },
        });
    }

    /**
     * Sets the game status to ABANDONED.
     * Called when a player voluntarily leaves or the reconnection TTL expires.
     *
     * @param gameId - ID of the game to abandon
     */
    async abandonGame(gameId: string): Promise<void> {
        await this.prisma.game.update({
            where: { id: gameId },
            data: { status: GameStatus.ABANDONED },
        });
    }

    async startGame(gameId: string): Promise<void> {
        await this.prisma.game.update({
            where: { id: gameId },
            data: { status: GameStatus.ONGOING },
        });
    }

    async getGameStatus(gameId: string): Promise<GameStatus | null> {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
            select: { status: true },
        });

        return game?.status ?? null;
    }

    /**
     * Finds the active game (WAITING | ONGOING | PAUSED) for a given player.
     * Used by the WebSocket gateway on connection to subscribe the socket to the right room.
     *
     * @param playerId - ID of the player
     * @returns the active game with full detail, or null if none
     */
    async findActiveGameForPlayer(playerId: string) {
        const gamePlayer = await this.prisma.gamePlayer.findFirst({
            where: {
                playerId,
                game: { status: { in: ACTIVE_GAME_STATUSES } },
            },
            include: {
                game: { include: GAME_DETAIL_INCLUDE },
            },
        });

        if (!gamePlayer) return null;

        return this.formatGameDetail(gamePlayer.game);
    }

    /**
     * Returns the opponent's GamePlayer record for a given game and player.
     *
     * @param gameId - ID of the game
     * @param playerId - ID of the player whose opponent is sought
     * @returns the opponent GamePlayer or null if not found
     */
    async findOpponent(gameId: string, playerId: string): Promise<{ playerId: string } | null> {
        return this.prisma.gamePlayer.findFirst({
            where: { gameId, playerId: { not: playerId } },
            select: { playerId: true },
        });
    }

    private formatGameDetail(
        game: Prisma.GameGetPayload<{ include: typeof GAME_DETAIL_INCLUDE }>,
    ) {
        return {
            game: {
                id: game.id,
                status: game.status,
                createdAt: game.createdAt,
                updatedAt: game.updatedAt,
            },
            gamePlayers: game.gamePlayers.map((gp) => ({
                id: gp.id,
                player: {
                    id: gp.player.id,
                    username: gp.player.userName,
                    createdAt: gp.player.createdAt,
                },
                ballType: gp.ballType,
                isTurn: gp.isTurn,
            })),
            gameBalls: game.gameBalls.map((gb) => ({
                id: gb.id,
                ball: {
                    id: gb.ball.id,
                    number: gb.ball.number,
                    type: gb.ball.type,
                    color: gb.ball.color,
                },
                x: gb.x,
                y: gb.y,
                isPocketed: gb.isPocketed,
            })),
        };
    }

    private async abandonActiveGamesForPlayer(playerId: string, excludeGameId?: string): Promise<void> {
        const existing = await this.prisma.gamePlayer.findMany({
            where: {
                playerId,
                game: {
                    status: { in: ACTIVE_GAME_STATUSES },
                    ...(excludeGameId ? { id: { not: excludeGameId } } : {}),
                },
            },
            select: { gameId: true },
        });

        if (existing.length === 0) {
            return;
        }

        await this.prisma.game.updateMany({
            where: {
                id: { in: existing.map((entry) => entry.gameId) },
                status: { in: ACTIVE_GAME_STATUSES },
            },
            data: { status: GameStatus.ABANDONED },
        });
    }
}
