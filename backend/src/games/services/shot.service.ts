import { Injectable } from '@nestjs/common';
import { BallType, GameStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CUE_BALL_SPAWN } from '../constants/rack-positions';
import { ShootDto } from '../dto/shoot.dto';
import { ShotResolvedDto } from '../dto/shot-resolved.dto';
import { GameRulesService } from './game-rules.service';
import { BallTypesAssigned, GameOverPayload, ShotResultPayload } from '../types/game.types';

type ProcessShootResult = {
    opponentId: string;
    shotParams: ShootDto;
};

type ProcessShotResolvedResult = {
    shotResult: ShotResultPayload;
    gameOver: GameOverPayload | null;
};

@Injectable()
export class ShotService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly gameRules: GameRulesService,
    ) {}

    /**
     * Validates that it is the shooter's turn and returns the shot params to forward to the opponent.
     * Throws if the game is not ONGOING, or it is not the shooter's turn.
     * Emit logic belongs to the gateway.
     *
     * @param gameId - ID of the current game
     * @param shooterId - ID of the player who emitted shoot
     * @param dto - shot parameters
     * @returns opponentId and shot params to forward
     */
    async processShoot(gameId: string, shooterId: string, dto: ShootDto): Promise<ProcessShootResult> {
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
            select: {
                status: true,
                gamePlayers: {
                    select: { playerId: true, isTurn: true },
                },
            },
        });

        if (!game) {
            throw new Error('GAME_NOT_FOUND');
        }

        if (game.status !== GameStatus.ONGOING) {
            throw new Error('GAME_NOT_ONGOING');
        }

        const gamePlayers = game.gamePlayers;

        const shooter = gamePlayers.find((gp) => gp.playerId === shooterId);
        if (!shooter?.isTurn) {
            throw new Error('NOT_YOUR_TURN');
        }

        const opponent = gamePlayers.find((gp) => gp.playerId !== shooterId);
        if (!opponent) {
            throw new Error('GAME_NOT_FOUND');
        }

        return { opponentId: opponent.playerId, shotParams: dto };
    }

    /**
     * Orchestrates full shot resolution: applies rules, persists state, returns results for emission.
     * Called after the shooting player reports the final ball state via shot_resolved.
     * Emit logic belongs to the gateway.
     *
     * @param gameId - ID of the current game
     * @param shooterId - ID of the player who shot
     * @param dto - final ball state reported by the client
     * @returns shot result payload and optional game over payload
     */
    async processShotResolved(
        gameId: string,
        shooterId: string,
        dto: ShotResolvedDto,
    ): Promise<ProcessShotResolvedResult> {
        const [gamePlayers, gameBalls] = await Promise.all([
            this.prisma.gamePlayer.findMany({
                where: { gameId },
                include: { player: { select: { id: true } } },
            }),
            this.prisma.gameBall.findMany({
                where: { gameId, isPocketed: false },
                include: { ball: { select: { number: true } } },
            }),
        ]);

        const shooter = gamePlayers.find((gp) => gp.playerId === shooterId)!;
        const opponent = gamePlayers.find((gp) => gp.playerId !== shooterId)!;

        if (!shooter?.isTurn) {
            throw new Error('NOT_YOUR_TURN');
        }

        const isFoul = this.gameRules.isFoul(dto.pocketedNumbers);
        const alreadyAssigned = gamePlayers.some((gp) => gp.ballType !== null);

        const ballTypesAssigned: BallTypesAssigned = this.gameRules.assignBallTypes(
            shooterId,
            opponent.playerId,
            dto.pocketedNumbers,
            alreadyAssigned,
        );

        const nextTurnPlayerId = this.gameRules.resolveNextTurn(
            shooterId,
            opponent.playerId,
            dto.pocketedNumbers,
            isFoul,
            alreadyAssigned
                ? shooter.ballType
                : null,
            ballTypesAssigned,
        );

        const remainingBallNumbers = gameBalls
            .map((gb) => gb.ball.number)
            .filter((n) => !dto.pocketedNumbers.includes(n));

        const shooterBallType: BallType | null =
            ballTypesAssigned
                ? (ballTypesAssigned.solids === shooterId ? BallType.SOLIDS : BallType.STRIPES)
                : shooter.ballType;

        const finalPositions = isFoul
            ? [
                ...dto.finalPositions.filter((p) => p.number !== 0),
                { number: 0, x: CUE_BALL_SPAWN.x, y: CUE_BALL_SPAWN.y },
            ]
            : dto.finalPositions;

        const gameOver = this.gameRules.isGameOver(
            shooterId,
            opponent.playerId,
            dto.pocketedNumbers,
            shooterBallType,
            remainingBallNumbers,
        );

        await this.persist(
            gameId,
            shooter.id,
            shooterId,
            opponent.id,
            opponent.playerId,
            dto.pocketedNumbers,
            finalPositions,
            nextTurnPlayerId,
            ballTypesAssigned,
            isFoul,
            gameOver,
        );

        return {
            shotResult: {
                pocketedNumbers: dto.pocketedNumbers,
                finalPositions,
                nextTurnPlayerId,
                ballTypesAssigned,
            },
            gameOver,
        };
    }

    private async persist(
        gameId: string,
        shooterGamePlayerId: string,
        shooterId: string,
        opponentGamePlayerId: string,
        opponentId: string,
        pocketedNumbers: number[],
        finalPositions: ShotResolvedDto['finalPositions'],
        nextTurnPlayerId: string,
        ballTypesAssigned: BallTypesAssigned,
        isFoul: boolean,
        gameOver: GameOverPayload | null,
    ): Promise<void> {
        const pocketedUpdates = pocketedNumbers
            .filter((n) => n !== 0 || !isFoul)
            .map((number) =>
                this.prisma.gameBall.updateMany({
                    where: { gameId, ball: { number } },
                    data: { isPocketed: true },
                }),
            );

        const positionUpdates = finalPositions.map((pos) =>
            this.prisma.gameBall.updateMany({
                where: { gameId, ball: { number: pos.number } },
                data: { x: pos.x, y: pos.y, isPocketed: false },
            }),
        );

        const shooterTurnUpdate = this.prisma.gamePlayer.update({
            where: { id: shooterGamePlayerId },
            data: {
                isTurn: nextTurnPlayerId === shooterId,
                ...(ballTypesAssigned && {
                    ballType: ballTypesAssigned.solids === shooterId ? BallType.SOLIDS : BallType.STRIPES,
                }),
            },
        });

        const opponentTurnUpdate = this.prisma.gamePlayer.update({
            where: { id: opponentGamePlayerId },
            data: {
                isTurn: nextTurnPlayerId === opponentId,
                ...(ballTypesAssigned && {
                    ballType: ballTypesAssigned.solids === opponentId ? BallType.SOLIDS : BallType.STRIPES,
                }),
            },
        });

        const gameUpdate = this.prisma.game.update({
            where: { id: gameId },
            data: { status: gameOver ? 'FINISHED' : undefined },
        });

        await this.prisma.$transaction([
            ...pocketedUpdates,
            ...positionUpdates,
            shooterTurnUpdate,
            opponentTurnUpdate,
            gameUpdate,
        ]);
    }
}
