import { BallType } from '../../generated/prisma/client';
import { GameRulesService } from './game-rules.service';

const S = 'shooter';
const O = 'opponent';

describe('GameRulesService', () => {
    let svc: GameRulesService;

    beforeEach(() => {
        svc = new GameRulesService();
    });

    describe('isFoul', () => {
        it('returns true when cue ball pocketed', () => {
            expect(svc.isFoul([0, 3])).toBe(true);
        });

        it('returns false when cue ball not pocketed', () => {
            expect(svc.isFoul([1, 3])).toBe(false);
        });
    });

    describe('resolveNextTurn', () => {
        it('passes turn on foul', () => {
            expect(svc.resolveNextTurn(S, O, [0], true, null, null)).toBe(O);
        });

        it('passes turn on miss (no legal pocket)', () => {
            expect(svc.resolveNextTurn(S, O, [], false, null, null)).toBe(O);
        });

        it('keeps turn when types just assigned this shot', () => {
            expect(svc.resolveNextTurn(S, O, [1], false, null, { solids: S, stripes: O })).toBe(S);
        });

        it('keeps turn when shooter pockets own ball type', () => {
            expect(svc.resolveNextTurn(S, O, [2], false, BallType.SOLIDS, null)).toBe(S);
        });

        it('passes turn when shooter pockets opponent ball type', () => {
            expect(svc.resolveNextTurn(S, O, [9], false, BallType.SOLIDS, null)).toBe(O);
        });
    });

    describe('assignBallTypes', () => {
        it('returns null if already assigned', () => {
            expect(svc.assignBallTypes(S, O, [1], true)).toBeNull();
        });

        it('returns null if no legal ball pocketed', () => {
            expect(svc.assignBallTypes(S, O, [], false)).toBeNull();
        });

        it('assigns solids to shooter on first solid pocket', () => {
            expect(svc.assignBallTypes(S, O, [3], false)).toEqual({ solids: S, stripes: O });
        });

        it('assigns stripes to shooter on first stripe pocket', () => {
            expect(svc.assignBallTypes(S, O, [10], false)).toEqual({ solids: O, stripes: S });
        });
    });

    describe('isGameOver', () => {
        it('returns null when eight not pocketed', () => {
            expect(svc.isGameOver(S, O, [3], BallType.SOLIDS, [1, 2])).toBeNull();
        });

        it('opponent wins with FOUL_ON_EIGHT when types not assigned', () => {
            expect(svc.isGameOver(S, O, [8], null, [])).toEqual({ winnerId: O, reason: 'FOUL_ON_EIGHT' });
        });

        it('opponent wins with FOUL_ON_EIGHT when shooter has balls remaining', () => {
            expect(svc.isGameOver(S, O, [8], BallType.SOLIDS, [1, 2, 8])).toEqual({ winnerId: O, reason: 'FOUL_ON_EIGHT' });
        });

        it('shooter wins with EIGHT_BALL_POCKETED when all own balls cleared', () => {
            expect(svc.isGameOver(S, O, [8], BallType.SOLIDS, [8])).toEqual({ winnerId: S, reason: 'EIGHT_BALL_POCKETED' });
        });
    });
});
