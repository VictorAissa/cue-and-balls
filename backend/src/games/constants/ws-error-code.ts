export const WsErrorCode = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    GAME_NOT_FOUND: 'GAME_NOT_FOUND',
    NOT_YOUR_TURN: 'NOT_YOUR_TURN',
    GAME_NOT_ONGOING: 'GAME_NOT_ONGOING',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type WsErrorCode = (typeof WsErrorCode)[keyof typeof WsErrorCode];