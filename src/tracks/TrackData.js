// ─── Utility helpers ──────────────────────────────────────────────────────────

/** Generate evenly-spaced points around an ellipse (clockwise in screen space). */
function ellipsePoints(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2; // top → right → bottom → left
    pts.push({ x: Math.round(cx + Math.cos(a) * rx), y: Math.round(cy + Math.sin(a) * ry) });
  }
  return pts;
}

/** Blend between two points at fraction t (0-1). */
function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Smooth a polygon's points using simple Chaikin subdivision (2 passes).
 * Makes hand-crafted tracks look curved instead of jagged.
 */
export function smoothPoints(pts, passes = 2) {
  let p = pts;
  for (let pass = 0; pass < passes; pass++) {
    const next = [];
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const a = p[i];
      const b = p[(i + 1) % n];
      next.push(lerp(a, b, 0.25));
      next.push(lerp(a, b, 0.75));
    }
    p = next;
  }
  return p;
}

/**
 * Compute outer + inner boundary polygons for a closed center-line path.
 * Both polygons are returned as flat [x,y,x,y,...] arrays suitable for
 * Phaser.Geom.Polygon.
 */
export function computeBoundaries(centerPoints, trackWidth) {
  const outer = [], inner = [];
  const n = centerPoints.length;
  const half = trackWidth / 2;

  for (let i = 0; i < n; i++) {
    const p0 = centerPoints[(i - 1 + n) % n];
    const p2 = centerPoints[(i + 1) % n];

    // Average tangent direction
    let tx = p2.x - p0.x;
    let ty = p2.y - p0.y;
    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= len; ty /= len;

    // Right normal (outer for CW track in screen space)
    const ox = -ty, oy = tx;

    const cx = centerPoints[i].x, cy = centerPoints[i].y;
    outer.push({ x: cx + ox * half, y: cy + oy * half });
    inner.push({ x: cx - ox * half, y: cy - oy * half });
  }
  return { outer, inner };
}

/**
 * Return the perpendicular distance from point (px,py) to the nearest
 * segment of the track center-line.  Used for on/off-track detection.
 */
export function distToTrack(px, py, centerPoints) {
  let minDist = Infinity;
  const n = centerPoints.length;
  for (let i = 0; i < n; i++) {
    const a = centerPoints[i];
    const b = centerPoints[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nearest = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(px - nearest.x, py - nearest.y);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Return the exact closest point (x,y) ON the center-line path.
 * Used for wall push-back direction.
 */
export function nearestPointOnTrack(px, py, centerPoints) {
  let minDist = Infinity;
  let nearX = centerPoints[0].x, nearY = centerPoints[0].y;
  const n = centerPoints.length;
  for (let i = 0; i < n; i++) {
    const a = centerPoints[i];
    const b = centerPoints[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nx = a.x + t * dx, ny = a.y + t * dy;
    const d = Math.hypot(px - nx, py - ny);
    if (d < minDist) { minDist = d; nearX = nx; nearY = ny; }
  }
  return { x: nearX, y: nearY };
}

/**
 * Get the normal of the nearest track segment (points away from road center).
 * Used for shell bounce reflections.
 */
export function nearestSegmentNormal(px, py, centerPoints) {
  let minDist = Infinity;
  let bestNx = 1, bestNy = 0;
  const n = centerPoints.length;
  for (let i = 0; i < n; i++) {
    const a = centerPoints[i];
    const b = centerPoints[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const nx2 = a.x + t * dx, ny2 = a.y + t * dy;
    const d = Math.hypot(px - nx2, py - ny2);
    if (d < minDist) {
      minDist = d;
      const len = Math.sqrt(lenSq) || 1;
      // Perpendicular to segment, pointing outward (right of CW direction)
      bestNx = -dy / len;
      bestNy =  dx / len;
    }
  }
  return { x: bestNx, y: bestNy };
}

/**
 * Pick evenly-spaced waypoints along the center-line (used for AI + lap counting).
 * Returns indices into centerPoints array.
 */
export function pickWaypointIndices(centerPoints, count) {
  const indices = [];
  const step = Math.floor(centerPoints.length / count);
  for (let i = 0; i < count; i++) indices.push(i * step);
  return indices;
}

/**
 * Scatter item-box positions along the track at given fractions (0-1).
 */
export function itemBoxPositions(centerPoints, fractions) {
  return fractions.map(f => {
    const idx = Math.floor(f * centerPoints.length) % centerPoints.length;
    // Offset slightly left of center so boxes don't block the racing line
    const n = centerPoints.length;
    const p0 = centerPoints[(idx - 1 + n) % n];
    const p2 = centerPoints[(idx + 1) % n];
    let tx = p2.x - p0.x, ty = p2.y - p0.y;
    const len = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= len; ty /= len;
    const lx = ty, ly = -tx; // left normal
    return { x: centerPoints[idx].x + lx * 30, y: centerPoints[idx].y + ly * 30 };
  });
}

// ─── Track definitions ────────────────────────────────────────────────────────

const ovalCenter = ellipsePoints(1000, 750, 700, 440, 48);

const stadiumRaw = (() => {
  const pts = [];
  // Top straight (left→right)
  for (let x = 320; x <= 1680; x += 120) pts.push({ x, y: 280 });
  // Right semicircle (top→bottom, center 1680,720)
  for (let i = 1; i <= 11; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    pts.push({ x: Math.round(1680 + Math.cos(a) * 440), y: Math.round(720 + Math.sin(a) * 440) });
  }
  // Bottom straight (right→left)
  for (let x = 1680; x >= 320; x -= 120) pts.push({ x, y: 1160 });
  // Left semicircle (bottom→top, center 320,720)
  for (let i = 1; i <= 11; i++) {
    const a = Math.PI / 2 + (i / 12) * Math.PI;
    pts.push({ x: Math.round(320 + Math.cos(a) * 440), y: Math.round(720 + Math.sin(a) * 440) });
  }
  return pts;
})();

// City circuit: rectangular with a chicane on the right side
const cityRaw = [
  // Top straight →
  { x: 350, y: 240 }, { x: 600, y: 230 }, { x: 850, y: 225 },
  { x: 1100, y: 225 }, { x: 1350, y: 230 }, { x: 1570, y: 240 },
  // TR corner
  { x: 1720, y: 280 }, { x: 1830, y: 400 },
  // Right side ↓ (first section)
  { x: 1850, y: 550 }, { x: 1850, y: 700 },
  // Chicane – jog left then right
  { x: 1700, y: 790 }, { x: 1560, y: 800 }, { x: 1530, y: 880 },
  { x: 1560, y: 960 }, { x: 1700, y: 970 }, { x: 1850, y: 1060 },
  // Right side ↓ (second section)
  { x: 1850, y: 1180 },
  // BR corner
  { x: 1790, y: 1320 }, { x: 1640, y: 1400 },
  // Bottom straight ←
  { x: 1400, y: 1420 }, { x: 1150, y: 1430 }, { x: 900, y: 1430 },
  { x: 650, y: 1425 }, { x: 400, y: 1410 },
  // BL corner
  { x: 220, y: 1330 }, { x: 160, y: 1160 },
  // Left side ↑
  { x: 155, y: 950 }, { x: 155, y: 700 }, { x: 155, y: 500 },
  // TL corner
  { x: 215, y: 340 }, { x: 355, y: 245 },
];

// Mountain pass: S-curves and hairpin
const mountainRaw = [
  // Start straight →
  { x: 280, y: 480 }, { x: 500, y: 470 }, { x: 750, y: 460 }, { x: 1000, y: 455 },
  // Sweeping right turn
  { x: 1180, y: 480 }, { x: 1320, y: 560 }, { x: 1380, y: 700 },
  // S-curve left
  { x: 1340, y: 860 }, { x: 1200, y: 970 }, { x: 1020, y: 1020 },
  { x: 840, y: 1050 }, { x: 690, y: 1120 },
  // Sweep right →
  { x: 570, y: 1260 }, { x: 540, y: 1420 }, { x: 610, y: 1570 },
  { x: 770, y: 1650 }, { x: 980, y: 1680 }, { x: 1200, y: 1690 },
  { x: 1450, y: 1680 }, { x: 1680, y: 1650 },
  // Right turn heading north ↑
  { x: 1840, y: 1560 }, { x: 1920, y: 1400 }, { x: 1930, y: 1220 },
  // S-curve 2
  { x: 1900, y: 1060 }, { x: 1790, y: 960 }, { x: 1630, y: 910 },
  // Tight hairpin left
  { x: 1470, y: 870 }, { x: 1340, y: 790 }, { x: 1300, y: 670 },
  { x: 1370, y: 555 }, { x: 1530, y: 490 },
  // Long top straight ←
  { x: 1720, y: 455 }, { x: 1920, y: 430 }, { x: 2060, y: 350 },
  { x: 2080, y: 230 }, { x: 1930, y: 150 },
  { x: 1650, y: 130 }, { x: 1350, y: 125 }, { x: 1050, y: 125 },
  { x: 750, y: 130 }, { x: 500, y: 145 },
  // Return to start
  { x: 340, y: 220 }, { x: 255, y: 350 },
];

// ─── Exported TRACKS array ───────────────────────────────────────────────────

export const TRACKS = [
  {
    id: 'oval',
    name: 'Oval Circuit',
    difficulty: 'Easy',
    trackWidth: 140,
    worldWidth: 2000,
    worldHeight: 1500,
    grassColor: 0x3d8b37,
    roadColor: 0x555555,
    curbColor: 0xcc2222,
    centerPoints: ovalCenter,
    // Start: top of oval, facing East
    startPos: { x: 1000, y: 310, angle: 0 },
    // Use every center-line point as a waypoint so bots hug the arc tightly
    waypointCount: 48,
    itemFractions: [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.92],
  },
  {
    id: 'stadium',
    name: 'Stadium Run',
    difficulty: 'Medium',
    trackWidth: 130,
    worldWidth: 2400,
    worldHeight: 1500,
    grassColor: 0x2e7d32,
    roadColor: 0x4a4a4a,
    curbColor: 0xdd4400,
    centerPoints: stadiumRaw,
    // Start: top-left of top straight, facing East
    startPos: { x: 440, y: 280, angle: 0 },
    waypointCount: 46,
    itemFractions: [0.07, 0.18, 0.32, 0.46, 0.57, 0.68, 0.80, 0.92],
  },
  {
    id: 'city',
    name: 'City Circuit',
    difficulty: 'Medium',
    trackWidth: 125,
    worldWidth: 2100,
    worldHeight: 1700,
    grassColor: 0x546e1a,
    roadColor: 0x484848,
    curbColor: 0xcc3300,
    centerPoints: smoothPoints(cityRaw, 3),
    // Start: on the top straight, facing East
    startPos: { x: 450, y: 235, angle: 0 },
    waypointCount: 56,
    itemFractions: [0.06, 0.18, 0.30, 0.42, 0.55, 0.68, 0.82],
  },
  {
    id: 'mountain',
    name: 'Mountain Pass',
    difficulty: 'Hard',
    trackWidth: 118,
    worldWidth: 2400,
    worldHeight: 1900,
    grassColor: 0x4a6741,
    roadColor: 0x505050,
    curbColor: 0xbb2200,
    centerPoints: smoothPoints(mountainRaw, 3),
    // Start: on the start straight, facing East
    startPos: { x: 380, y: 475, angle: 0 },
    waypointCount: 70,
    itemFractions: [0.05, 0.14, 0.24, 0.33, 0.43, 0.53, 0.63, 0.74, 0.85, 0.94],
  },
];
