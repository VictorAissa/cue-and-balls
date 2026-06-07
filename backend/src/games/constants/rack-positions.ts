// Standard 8-ball rack: triangle at 3/4 of table length, apex ball at top.
// Coordinates normalized [0,1]. Origin top-left, x=horizontal, y=vertical.
// Table ratio 2:1 (width:height). Ball radius ~0.03 in normalized space.
//
// Row layout (front to back, apex first):
//   Row 1: ball 1  (apex)
//   Row 2: balls 2, 3
//   Row 3: balls 4, 8, 5   (eight ball in center)
//   Row 4: balls 6, 14, 10, 11
//   Row 5: balls 12, 7, 3*, 13, 15  (* already used: corrected below)
//
// Standard rack order (WPA rules): 1 at apex, 8 in center, corners = one solid + one stripe.
// Exact ball placement per row:
//   Row 1: [1]
//   Row 2: [2, 9]
//   Row 3: [3, 8, 10]
//   Row 4: [4, 14, 11, 7]
//   Row 5: [12, 6, 5, 13, 15]

const RACK_X = 0.75;
const CUE_BALL_X = 0.25;
const CENTER_Y = 0.5;

// Spacing between ball centers (normalized). Balls touch: radius ~0.028 each side.
const DX = 0.056;
const DY = 0.032;

type RackPosition = { number: number; x: number; y: number };

export const RACK_POSITIONS: RackPosition[] = [
    // Row 1
    { number: 1, x: RACK_X, y: CENTER_Y },
    // Row 2
    { number: 2, x: RACK_X + DX, y: CENTER_Y - DY },
    { number: 9, x: RACK_X + DX, y: CENTER_Y + DY },
    // Row 3
    { number: 3, x: RACK_X + 2 * DX, y: CENTER_Y - 2 * DY },
    { number: 8, x: RACK_X + 2 * DX, y: CENTER_Y },
    { number: 10, x: RACK_X + 2 * DX, y: CENTER_Y + 2 * DY },
    // Row 4
    { number: 4, x: RACK_X + 3 * DX, y: CENTER_Y - 3 * DY },
    { number: 14, x: RACK_X + 3 * DX, y: CENTER_Y - DY },
    { number: 11, x: RACK_X + 3 * DX, y: CENTER_Y + DY },
    { number: 7, x: RACK_X + 3 * DX, y: CENTER_Y + 3 * DY },
    // Row 5
    { number: 12, x: RACK_X + 4 * DX, y: CENTER_Y - 4 * DY },
    { number: 6, x: RACK_X + 4 * DX, y: CENTER_Y - 2 * DY },
    { number: 5, x: RACK_X + 4 * DX, y: CENTER_Y },
    { number: 13, x: RACK_X + 4 * DX, y: CENTER_Y + 2 * DY },
    { number: 15, x: RACK_X + 4 * DX, y: CENTER_Y + 4 * DY },
];

export const CUE_BALL_SPAWN: RackPosition = {
    number: 0,
    x: CUE_BALL_X,
    y: CENTER_Y,
};