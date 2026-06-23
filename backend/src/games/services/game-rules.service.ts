import { Injectable } from '@nestjs/common';
import { BallType } from '../../generated/prisma/client';
import { BallTypesAssigned, GameOverReason } from '../types/game.types';

const CUE_BALL_NUMBER = 0;
const EIGHT_BALL_NUMBER = 8;
const SOLIDS_NUMBERS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES_NUMBERS = [9, 10, 11, 12, 13, 14, 15];

@Injectable()
export class GameRulesService {
    /**
     * Detects whether the shot was a foul (cue ball pocketed).
     *
     * @param pocketedNumbers - ball numbers pocketed this shot
     * @returns true if the cue ball was pocketed
     */
    isFoul(pocketedNumbers: number[]): boolean {
        return pocketedNumbers.includes(CUE_BALL_NUMBER);
    }

    /**
     * Determines which player plays next after a shot.
     * The shooter keeps the turn on a legal pocket (non-foul, non-eight).
     * The turn passes to the opponent on a miss, foul, or eight ball pocket.
     *
     * @param shooterId - ID of the player who just shot
     * @param opponentId - ID of the other player
     * @param pocketedNumbers - ball numbers pocketed this shot (may include cue ball)
     * @param isFoul - whether the shot was a foul
     * @returns ID of the player who plays next
     */
    resolveNextTurn(
        shooterId: string,
        opponentId: string,
        pocketedNumbers: number[],
        isFoul: boolean,
        shooterBallType: BallType | null,
        ballTypesAssigned: BallTypesAssigned | null,
    ): string {
        if (isFoul) return opponentId;

        const legalPockets = pocketedNumbers.filter((n) => n !== CUE_BALL_NUMBER && n !== EIGHT_BALL_NUMBER);
        if (legalPockets.length === 0) {
            return opponentId;
        }

        if (ballTypesAssigned) {
            return shooterId;
        }

        if (!shooterBallType) {
            return shooterId;
        }

        const shooterBallNumbers = shooterBallType === BallType.SOLIDS ? SOLIDS_NUMBERS : STRIPES_NUMBERS;
        const pocketedOwnBall = legalPockets.some((number) => shooterBallNumbers.includes(number));

        return pocketedOwnBall ? shooterId : opponentId;
    }

    /**
     * Assigns ball types (SOLIDS/STRIPES) to players on the first legal non-eight pocket after the break.
     * Returns null if types are already assigned or no legal non-eight ball was pocketed.
     *
     * @param shooterId - ID of the player who just shot
     * @param opponentId - ID of the other player
     * @param pocketedNumbers - ball numbers pocketed this shot
     * @param alreadyAssigned - whether ball types have already been assigned this game
     * @returns BallTypesAssigned with player IDs, or null if no assignment occurs this turn
     */
    assignBallTypes(
        shooterId: string,
        opponentId: string,
        pocketedNumbers: number[],
        alreadyAssigned: boolean,
    ): BallTypesAssigned {
        if (alreadyAssigned) return null;

        const firstSolid = pocketedNumbers.find((n) => SOLIDS_NUMBERS.includes(n));
        const firstStripe = pocketedNumbers.find((n) => STRIPES_NUMBERS.includes(n));

        // no legal non-eight ball pocketed yet
        if (!firstSolid && !firstStripe) return null;

        // shooter pocketed a solid first: shooter gets solids
        if (firstSolid) {
            return { solids: shooterId, stripes: opponentId };
        }

        // shooter pocketed a stripe first: shooter gets stripes
        return { solids: opponentId, stripes: shooterId };
    }

    /**
     * Checks whether the game is over after a shot.
     * Win: eight ball pocketed after clearing all own balls.
     * Loss: eight ball pocketed before clearing all own balls (FOUL_ON_EIGHT).
     *
     * @param shooterId - ID of the player who just shot
     * @param opponentId - ID of the other player
     * @param pocketedNumbers - ball numbers pocketed this shot
     * @param shooterBallType - ball type assigned to the shooter (null if not yet assigned)
     * @param remainingBallNumbers - numbers of all non-pocketed balls still on the table (excluding cue)
     * @returns game over payload with winnerId and reason, or null if game continues
     */
    isGameOver(
        shooterId: string,
        opponentId: string,
        pocketedNumbers: number[],
        shooterBallType: BallType | null,
        remainingBallNumbers: number[],
    ): { winnerId: string; reason: GameOverReason } | null {
        if (!pocketedNumbers.includes(EIGHT_BALL_NUMBER)) return null;

        // eight pocketed before types assigned = loss
        if (!shooterBallType) {
            return { winnerId: opponentId, reason: 'FOUL_ON_EIGHT' };
        }

        const shooterBallNumbers = shooterBallType === BallType.SOLIDS ? SOLIDS_NUMBERS : STRIPES_NUMBERS;

        // remaining shooter balls on table before this shot (excluding just-pocketed ones)
        const shooterBallsStillOnTable = remainingBallNumbers.filter(
            (n) => shooterBallNumbers.includes(n) && !pocketedNumbers.includes(n),
        );

        if (shooterBallsStillOnTable.length > 0) {
            return { winnerId: opponentId, reason: 'FOUL_ON_EIGHT' };
        }

        return { winnerId: shooterId, reason: 'EIGHT_BALL_POCKETED' };
    }
}
