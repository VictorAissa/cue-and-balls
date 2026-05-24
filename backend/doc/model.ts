interface Game  {
    id: string;
    status: GameStatus;
    createdAt: Date;
    updatedAt: Date;
}

interface Player {
    id: string;
    userName: string;
    email: string;
    passwordHash: string;
}

interface GamePlayer {
    id: string;
    game: Game;
    player: Player;
    ballType: BallType.SOLIDS | BallType.STRIPES | null;
    isTurn: boolean;
}

interface Ball {
    id: string;
    number: number;
    type: BallType | null;
    color: string; //hexa
}

interface GameBall {
    id: string;
    game: Game;
    ball: Ball;
    x: number;
    y: number;
    isPocketed: boolean;
}

enum BallType {
    SOLIDS,   // 1-7
    STRIPES,  // 9-15
}

enum GameStatus {
    WAITING,
    ONGOING,
    PAUSED,
    FINISHED,
    ABANDONED,
}