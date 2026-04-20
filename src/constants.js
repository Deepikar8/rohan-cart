export const GAME_WIDTH  = 1280;
export const GAME_HEIGHT = 720;

// Kart physics
export const KART_MAX_SPEED    = 220;   // px/s
export const KART_ACCEL        = 190;   // px/s²
export const KART_DECEL        = 240;   // px/s²
export const KART_TURN_RATE    = 2.6;   // rad/s (scales with speed)
export const KART_REVERSE_MAX  = 80;    // px/s

export const GRASS_SPEED_MULT  = 0.32;  // off-track speed penalty

export const BOT_DIFFICULTIES = {
  easy: {
    label: 'Easy',
    maxSpeedMultiplier: 0.78,
    lookahead: 1,
    steerDead: 0.10,
    itemIntervalMin: 1300,
    itemIntervalMax: 1900,
    shellRange: 280,
    bananaRange: 170,
    boostUseRankThreshold: 0.75,
  },
  medium: {
    label: 'Medium',
    maxSpeedMultiplier: 0.87,
    lookahead: 1,
    steerDead: 0.06,
    itemIntervalMin: 900,
    itemIntervalMax: 1500,
    shellRange: 320,
    bananaRange: 200,
    boostUseRankThreshold: 0.5,
  },
  hard: {
    label: 'Hard',
    maxSpeedMultiplier: 0.97,
    lookahead: 2,
    steerDead: 0.035,
    itemIntervalMin: 650,
    itemIntervalMax: 1100,
    shellRange: 360,
    bananaRange: 240,
    boostUseRankThreshold: 0.34,
  },
};

// Items
export const BOOST_MULTIPLIER  = 3;
export const BOOST_DURATION    = 3000;  // ms
export const STUN_DURATION     = 2000;  // ms
export const SLIDE_DURATION    = 1500;  // ms

export const SHELL_SPEED       = 480;   // px/s
export const SHELL_MAX_BOUNCES = 3;
export const SHELL_LIFETIME    = 7000;  // ms

export const BANANA_LIFETIME   = 30000; // ms

export const ITEM_BOX_RESPAWN  = 10000; // ms

// Item weight table (must sum to 100)
export const ITEM_WEIGHTS = { shell: 35, banana: 40, boost: 25 };

// Visual
export const KART_COLORS = [
  0x2255ee, // Player  – blue
  0xee3333, // Bot A   – red
  0x22cc44, // Bot B   – green
  0xeeaa00, // Bot C   – amber
  0xaa22cc, // Bot D   – purple
];

export const KART_NAMES = ['You', 'Bot-A', 'Bot-B', 'Bot-C', 'Bot-D'];

// Grid layout (offsets relative to start line in track-local space)
// rowOffset = along track direction (negative = behind start line)
// colOffset = perpendicular (+ = right, – = left)
export const START_GRID = [
  { row: -55,  col: -32 },
  { row: -55,  col:  32 },
  { row: -110, col: -32 },
  { row: -110, col:  32 },
  { row: -165, col:   0 },
];
