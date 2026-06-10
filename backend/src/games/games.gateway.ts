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

const RECONNECTION_TTL_MS = 30_000;

type AuthenticatedSocket = Socket & { playerId: string; gameId: string };

@WebSocketGateway({ namespace: '/game', cors: { origin: '*' } })
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

    async handleConnection(client: Socket): Promise<void> {
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
            (client as AuthenticatedSocket).playerId = playerId;
            (client as AuthenticatedSocket).gameId = gameId;

            await client.join(gameId);

            // cancel pending reconnection timer if any
            const pending = this.reconnectionTimers.get(playerId);
            if (pending) {
                clearTimeout(pending);
                this.reconnectionTimers.delete(playerId);
            }

            client.emit('room_joined', gameState);

            // game_started is emitted when both players are in the room
            const sockets = await this.server.in(gameId).fetchSockets();
            if (sockets.length === 2) {
                const turnPlayer = gameState.gamePlayers.find((gp) => gp.isTurn);
                this.server.to(gameId).emit('game_started', {
                    firstTurnPlayerId: turnPlayer?.player.id ?? gameState.gamePlayers[0].player.id,
                    players: gameState.gamePlayers,
                });
            }
        } catch {
            client.emit('error', { code: WsErrorCode.UNAUTHORIZED, message: 'Unauthorized' });
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket): Promise<void> {
        const { playerId, gameId } = client as AuthenticatedSocket;
        if (!playerId || !gameId) return;

        this.server.to(gameId).emit('player_left', { playerId });

        const timer = setTimeout(async () => {
            this.reconnectionTimers.delete(playerId);
            const opponentSocket = await this.findOpponentSocket(gameId, playerId);
            const winnerId = (opponentSocket as AuthenticatedSocket | undefined)?.playerId;

            if (winnerId) {
                this.server.to(gameId).emit('game_over', { winnerId, reason: 'OPPONENT_DISCONNECTED' });
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
        try {
            const { playerId, gameId } = client;
            const { shotParams } = await this.shotService.processShoot(gameId, playerId, dto);

            const opponentSocket = await this.findOpponentSocket(gameId, playerId);
            if (opponentSocket) {
                opponentSocket.emit('opponent_shot', shotParams);
            }
        } catch (err) {
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
        try {
            const { playerId, gameId } = client;
            const { shotResult, gameOver } = await this.shotService.processShotResolved(gameId, playerId, dto);

            this.server.to(gameId).emit('shot_result', shotResult);

            if (gameOver) {
                this.server.to(gameId).emit('game_over', gameOver);
            }
        } catch {
            client.emit('error', { code: WsErrorCode.INTERNAL_ERROR, message: 'Internal error' });
        }
    }

    @SubscribeMessage('pause_request')
    async handlePauseRequest(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
        try {
            const { playerId, gameId } = client;
            const result = await this.gamesService.pauseGame(gameId, playerId);
            this.server.to(gameId).emit('game_paused', result);
        } catch {
            client.emit('error', { code: WsErrorCode.INTERNAL_ERROR, message: 'Internal error' });
        }
    }

    @SubscribeMessage('resume_request')
    async handleResumeRequest(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
        try {
            const { gameId } = client;
            await this.gamesService.resumeGame(gameId);
            this.server.to(gameId).emit('game_resumed', {});
        } catch {
            client.emit('error', { code: WsErrorCode.INTERNAL_ERROR, message: 'Internal error' });
        }
    }

    @SubscribeMessage('leave_game')
    async handleLeaveGame(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
        try {
            const { playerId, gameId } = client;
            const opponentSocket = await this.findOpponentSocket(gameId, playerId);
            const winnerId = (opponentSocket as AuthenticatedSocket | undefined)?.playerId;

            if (winnerId) {
                this.server.to(gameId).emit('game_over', { winnerId, reason: 'OPPONENT_LEFT' });
            }

            await this.gamesService.abandonGame(gameId);
            client.disconnect();
        } catch {
            client.emit('error', { code: WsErrorCode.INTERNAL_ERROR, message: 'Internal error' });
        }
    }

    private extractToken(client: Socket): string {
        const raw: string = client.handshake.auth?.token ?? '';
        return raw.replace(/^Bearer\s+/i, '');
    }

    private async findOpponentSocket(gameId: string, playerId: string): Promise<Socket | undefined> {
        const sockets = await this.server.in(gameId).fetchSockets();
        return sockets.find((s) => (s as unknown as AuthenticatedSocket).playerId !== playerId) as Socket | undefined;
    }
}