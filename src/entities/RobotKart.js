import { Kart, STATE } from './Kart.js';
import { KART_MAX_SPEED, BOT_DIFFICULTIES } from '../constants.js';

// Cones for item usage
const FIRE_CONE = Math.PI / 5;
const REAR_CONE = Math.PI / 4;

export class RobotKart extends Kart {
  constructor(scene, x, y, angle, botIndex, trackData, difficulty = 'medium') {
    super(scene, x, y, angle, botIndex, trackData);
    const preset = BOT_DIFFICULTIES[difficulty] || BOT_DIFFICULTIES.medium;
    this.botDifficulty = BOT_DIFFICULTIES[difficulty] ? difficulty : 'medium';
    this.baseMaxSpeed  = KART_MAX_SPEED * preset.maxSpeedMultiplier;
    this.maxSpeed      = this.baseMaxSpeed;
    this._lookahead    = preset.lookahead;
    this._steerDead    = preset.steerDead;
    this._shellRange   = preset.shellRange;
    this._bananaRange  = preset.bananaRange;
    this._boostUseRankThreshold = preset.boostUseRankThreshold;
    this._itemTick     = 0;
    this._itemInterval = preset.itemIntervalMin + Math.random() * (preset.itemIntervalMax - preset.itemIntervalMin);
  }

  // ── Driving AI ────────────────────────────────────────────────────────────

  _applyInput(dt, effMax) {
    const spd = Math.hypot(this.vx, this.vy);

    // ── Pick target: look several waypoints ahead so the bot pre-steers
    //    into corners rather than reacting too late.
    const ahead      = spd < 60 ? 1 : this._lookahead;
    const targetIdx  = (this.nextWpIdx + ahead) % this.waypoints.length;
    const wp         = this.waypoints[targetIdx];

    const dx        = wp.x - this.x;
    const dy        = wp.y - this.y;
    const targetAng = Math.atan2(dy, dx);

    let diff = targetAng - this.sprite.rotation;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    // Steer toward the target
    if (diff >  this._steerDead) this._doSteerRight(dt);
    else if (diff < -this._steerDead) this._doSteerLeft(dt);

    // Always accelerate at max; car physics + lateral friction will curve us naturally
    this._doAccel(dt, effMax);
  }

  // ── Item AI ───────────────────────────────────────────────────────────────

  tickItemAI(delta, allKarts, myRank, totalKarts) {
    if (this.state === STATE.STUNNED || this.state === STATE.FINISHED) return null;
    if (!this.items[0] && !this.items[1]) return null;

    this._itemTick += delta;
    if (this._itemTick < this._itemInterval) return null;
    this._itemTick = 0;

    for (let slot = 0; slot < 2; slot++) {
      const item = this.items[slot];
      if (!item) continue;

      if (item === 'boost' && myRank > Math.ceil(totalKarts * this._boostUseRankThreshold)) {
        return this._doUse(slot);
      }
      if (item === 'shell') {
        if (this._findKartInCone(allKarts, this.sprite.rotation, FIRE_CONE, this._shellRange))
          return this._doUse(slot);
      }
      if (item === 'banana') {
        if (this._findKartInCone(allKarts, this.sprite.rotation + Math.PI, REAR_CONE, this._bananaRange))
          return this._doUse(slot);
      }
    }
    return null;
  }

  _doUse(slot) {
    const item = this.useItem(slot);
    return item ? { item, kart: this, slot } : null;
  }

  _findKartInCone(karts, coneAngle, halfAngle, maxDist) {
    for (const k of karts) {
      if (k === this || k.finished || k.state === STATE.FINISHED) continue;
      const dx = k.x - this.x, dy = k.y - this.y;
      if (Math.hypot(dx, dy) > maxDist) continue;
      let ang = Math.atan2(dy, dx) - coneAngle;
      while (ang >  Math.PI) ang -= 2 * Math.PI;
      while (ang < -Math.PI) ang += 2 * Math.PI;
      if (Math.abs(ang) < halfAngle) return k;
    }
    return null;
  }
}
