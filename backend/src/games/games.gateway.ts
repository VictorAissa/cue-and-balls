import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsErrorCode } from './constants/ws-error-code';
import { ShootDto } from './dto/shoot.dto';
import { ShotResolvedDto } from './dto/shot-resolved.dto';
import { GamesService } from './services/games.service';
import { ShotService } from './services/shot.service';

const RECONNECTION_TTL_MS = 150_000;

type SocketData = { playerId?: string; gameId?: string };
type AuthenticatedSocket = Socket<any, any, any, SocketData>;

@WebSocketGateway({
    namespace: '/game',
    cors: { origin: '*' },
    pingInterval: 15000,
    pingTimeout: 10000,
})
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    private readonly server!: Server;

    // in-memory reconnection timers, keyed by playerId
    // note: timers are local to the pod — acceptable for this project scope
    private readonly reconnectionTimers = new Map<string, NodeJS.Timeout>();

    constructor(
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        private readonly gamesService: GamesService,
        private readonly shotService: ShotService,
    ) {}

    async handleConnection(client: AuthenticatedSocket): Promise<void> {
        try {
            const token = this.extractToken(client);
            const payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
                secret: this.config.getOrThrow<string>('JWT_SECRET'),
            });

            const playerId = payload.sub;
            const gameState = await this.gamesService.findActiveGameForPlayer(playerId);

            if (!gameState) {
                client.emit('error', { code: WsErrorCode.GAME_NOT_FOUND, message: 'No active game found' });
                client.disconnect();
                return;
            }

            const gameId = gameState.game.id;
            client.data.playerId = playerId;
            client.data.gameId = gameId;

            await client.join(gameId);

            // cancel pending reconnection timer if any
            const pending = this.reconnectionTimers.get(playerId);
            if (pending) {
                clearTimeout(pending);
                this.reconnectionTimers.delete(playerId);
            }

            client.emit('room_joined', gameState);
            const connectedPlayerIds = await this.getConnectedPlayerIds(gameId);
            if (connectedPlayerIds.size > 1) {
                client.to(gameId).emit('player_rejoined', { playerId });
            }

            // Start the match when two distinct players are actually connected to the room.
            if (gameState.game.status === 'WAITING' && connectedPlayerIds.size === 2) {
                await this.gamesService.startGame(gameId);
                const startedGameState = await this.gamesService.getGame(gameId);
                const turnPlayer = startedGameState.gamePlayers.find((gp) => gp.isTurn);
                this.server.to(gameId).emit('game_started', {
                    firstTurnPlayerId: turnPlayer?.player.id ?? startedGameState.gamePlayers[0].player.id,
                    players: startedGameState.gamePlayers,
                    gameBalls: startedGameState.gameBalls,
                });
            }
        } catch {
            client.emit('error', { code: WsErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
            client.disconnect();
        }
    }

    async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
        const { playerId, gameId } = client.data;
        if (!playerId || !gameId) return;

        const status = await this.gamesService.getGameStatus(gameId);
        if (!status || !['WAITING', 'ONGOING', 'PAUSED'].includes(status)) {
            return;
        }

        const connectedPlayerIds = await this.getConnectedPlayerIds(gameId);
        if (connectedPlayerIds.has(playerId)) {
            return;
        }

        this.server.to(gameId).emit('player_left', { playerId });

        const existingTimer = this.reconnectionTimers.get(playerId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(async () => {
            this.reconnectionTimers.delete(playerId);
            const latestStatus = await this.gamesService.getGameStatus(gameId);
            if (!latestStatus || !['WAITING', 'ONGOING', 'PAUSED'].includes(latestStatus)) {
                return;
            }
            const connectedPlayerIds = await this.getConnectedPlayerIds(gameId);
            if (connectedPlayerIds.has(playerId)) {
                return;
            }
            const opponent = await this.gamesService.findOpponent(gameId, playerId);
            if (opponent) {
                this.server.to(gameId).emit('game_over', { winnerId: opponent.playerId, reason: 'OPPONENT_DISCONNECTED' });
            }
            await this.gamesService.abandonGame(gameId);
        }, RECONNECTION_TTL_MS);

        this.reconnectionTimers.set(playerId, timer);
    }

    @SubscribeMessage('shoot')
    async handleShoot(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() dto: ShootDto,
    ): Promise<void> {
        const auth = this.getAuthContext(client);
        if (!auth) {
            client.emit('error', { code: WsErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
            return;
        }

        try {
            const { playerId, gameId } = auth;
            console.log('[GameGateway] shoot received', { playerId, gameId, dto });
            const { shotParams } = await this.shotService.processShoot(gameId, playerId, dto);
            const sockets = await this.server.in(gameId).fetchSockets();

            console.log('[GameGateway] opponent_shot broadcast', {
                playerId,
                gameId,
                socketIds: sockets.map((socket) => socket.id),
                recipientSocketIds: sockets
                    .filter((socket) => socket.id !== client.id)
                    .map((socket) => socket.id),
                shotParams,
            });

            sockets
                .filter((socket) => socket.id !== client.id)
                .forEach((socket) => {
                    socket.emit('opponent_shot', shotParams);
                });
        } catch (err) {
            console.log('[GameGateway] shoot rejected', {
                playerId: client.data.playerId,
                gameId: client.data.gameId,
                error: err instanceof Error ? err.message : 'Internal error',
            });
            const code = err instanceof Error && err.message in WsErrorCode
                ? err.message as WsErrorCode
                : WsErrorCode.INTERNAL_ERROR;
            client.emit('error', { code, message: err instanceof Error ? err.message : 'Internal error' });
        }
    }

    @SubscribeMessage('shot_resolved')
    async handleShotResolved(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() dto: ShotResolvedDto,
    ): Promise<void> {
        const auth = this.getAuthContext(client);
        if (!auth) {
            client.emit('error', { code: WsErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
            return;
        }

        try {
            const { playerId, gameId } = auth;
            console.log('[GameGateway] shot_resolved received', { playerId, gameId, dto });
            const { shotResult, gameOver } = await this.shotService.processShotResolved(gameId, playerId, dto);

            console.log('[GameGateway] shot_result broadcast', {
                playerId,
                gameId,
                shotResult,
                gameOver,
            });

            this.server.to(gameId).emit('shot_result', shotResult);

            if (gameOver) {
                this.server.to(gameId).emit('game_over', gameOver);
            }
        } catch (err) {
            const code = err instanceof Error && err.message in WsErrorCode
                ? err.message as WsErrorCode
                : WsErrorCode.INTERNAL_ERROR;
            client.emit('error', { code, message: err instanceof Error ? err.message : 'Internal error' });
        }
    }

    @SubscribeMessage('pause_request')
    async handlePauseRequest(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
        const auth = this.getAuthContext(client);
        if (!auth) {
            client.emit('error', { code: WsErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
            return;
        }

        try {
            const { playerId, gameId } = auth;
            const result = await this.gamesService.pauseGame(gameId, playerId);
            this.server.to(gameId).emit('game_paused', result);
        } catch {
            client.emit('error', { code: WsErrorCode.INTERNAL_ERROR, message: 'Internal error' });
        }
    }

    @SubscribeMessage('resume_request')
    async handleResumeRequest(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
        const auth = this.getAuthContext(client);
        if (!auth) {
            client.emit('error', { code: WsErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
            return;
        }

        try {
            const { gameId } = auth;
            await this.gamesService.resumeGame(gameId);
            this.server.to(gameId).emit('game_resumed', {});
        } catch {
            client.emit('error', { code: WsErrorCode.INTERNAL_ERROR, message: 'Internal error' });
        }
    }

    @SubscribeMessage('leave_game')
    async handleLeaveGame(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
        const auth = this.getAuthContext(client);
        if (!auth) {
            client.emit('error', { code: WsErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
            return;
        }

        try {
            const { playerId, gameId } = auth;
            const pending = this.reconnectionTimers.get(playerId);
            if (pending) {
                clearTimeout(pending);
                this.reconnectionTimers.delete(playerId);
            }
            const opponent = await this.gamesService.findOpponent(gameId, playerId);
            await this.gamesService.abandonGame(gameId);
            if (opponent) {
                this.server.to(gameId).emit('game_over', { winnerId: opponent.playerId, reason: 'OPPONENT_LEFT' });
            }
            client.disconnect();
        } catch {
            client.emit('error', { code: WsErrorCode.INTERNAL_ERROR, message: 'Internal error' });
        }
    }

    private extractToken(client: Socket): string {
        const raw: string = client.handshake.auth?.token ?? '';
        return raw.replace(/^Bearer\s+/i, '');
    }

    private getAuthContext(client: AuthenticatedSocket): { playerId: string; gameId: string } | null {
        const { playerId, gameId } = client.data;
        if (!playerId || !gameId) {
            return null;
        }

        return { playerId, gameId };
    }

    private async findOpponentSocket(gameId: string, playerId: string): Promise<Socket | undefined> {
        const sockets = await this.server.in(gameId).fetchSockets();
        return sockets.find((socket) => socket.data.playerId !== playerId) as Socket | undefined;
    }

    private async getConnectedPlayerIds(gameId: string): Promise<Set<string>> {
        const sockets = await this.server.in(gameId).fetchSockets();
        return new Set(
            sockets
                .map((socket) => socket.data.playerId)
                .filter((playerId): playerId is string => Boolean(playerId)),
        );
    }
}
