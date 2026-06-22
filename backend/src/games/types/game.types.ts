import { BallType, GameStatus } from '../../generated/prisma/client';

export type BallPosition = {
    number: number;
    x: number;
    y: number;
};

export type GameOverReason =
    | 'EIGHT_BALL_POCKETED'
    | 'FOUL_ON_EIGHT'
    | 'OPPONENT_LEFT'
    | 'OPPONENT_DISCONNECTED';

export type BallTypesAssigned = {
    solids: string;
    stripes: string;
} | null;

export type RoomJoinedPayload = {
    game: {
        id: string;
        status: GameStatus;
        createdAt: Date;
        updatedAt: Date;
    };
    gamePlayers: GamePlayerPayload[];
    gameBalls: GameBallPayload[];
};

export type GamePlayerPayload = {
    id: string;
    player: {
        id: string;
        username: string;
        createdAt: Date;
    };
    ballType: BallType | null;
    isTurn: boolean;
};

export type GameBallPayload = {
    id: string;
    ball: {
        id: string;
        number: number;
        type: BallType | null;
        color: string;
    };
    x: number;
    y: number;
    isPocketed: boolean;
};

export type ShotResultPayload = {
    pocketedNumbers: number[];
    finalPositions: BallPosition[];
    nextTurnPlayerId: string;
    ballTypesAssigned: BallTypesAssigned;
};

export type GameOverPayload = {
    winnerId: string;
    reason: GameOverReason;
};
