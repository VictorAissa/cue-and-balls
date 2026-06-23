// Normalized positions derived from frontend GameTestStage.
// Origin: top-left of playable cloth, normalized in [0, 1].
// These values must stay aligned with the frontend truth table geometry.

type RackPosition = { number: number; x: number; y: number };

const TABLE = {
    playWidth: 584,
    playHeight: 996,
    cueSpawn: {
        x: 380,
        y: 930,
    },
};

const BALL_LAYOUT = [1, 10, 2, 12, 8, 3, 14, 4, 9, 5, 13, 6, 15, 7, 11];
const BALL_DIAMETER = 44;
const RACK_SPACING = BALL_DIAMETER + 2;
const RACK_CENTER_X = 380;
const RACK_APEX_Y = 112 + 996 * 0.4;

function normalizeX(x: number) {
    return x / TABLE.playWidth;
}

function normalizeY(y: number) {
    return (y - 112) / TABLE.playHeight;
}

function getInitialRackCoordinates() {
    const positions: Array<{ x: number; y: number }> = [];

    for (let row = 0; row < 5; row += 1) {
        const y = RACK_APEX_Y - row * (RACK_SPACING * 0.92);
        const startX = RACK_CENTER_X - (row * RACK_SPACING) / 2;

        for (let column = 0; column <= row; column += 1) {
            positions.push({
                x: startX + column * RACK_SPACING,
                y,
            });
        }
    }

    return positions;
}

export const RACK_POSITIONS: RackPosition[] = BALL_LAYOUT.map((number, index) => {
    const position = getInitialRackCoordinates()[index];

    return {
        number,
        x: normalizeX(position.x - 88),
        y: normalizeY(position.y),
    };
});

export const CUE_BALL_SPAWN: RackPosition = {
    number: 0,
    x: normalizeX(TABLE.cueSpawn.x - 88),
    y: normalizeY(TABLE.cueSpawn.y),
};
