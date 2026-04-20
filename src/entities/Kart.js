import {
  KART_MAX_SPEED, KART_ACCEL, KART_DECEL, KART_TURN_RATE,
  KART_REVERSE_MAX, GRASS_SPEED_MULT,
  BOOST_MULTIPLIER, BOOST_DURATION,
  STUN_DURATION, SLIDE_DURATION,
  KART_COLORS, KART_NAMES,
} from '../constants.js';
import { distToTrack, nearestPointOnTrack } from '../tracks/TrackData.js';

export const STATE = {
  NORMAL:   'NORMAL',
  STUNNED:  'STUNNED',
  SLIDING:  'SLIDING',
  BOOSTING: 'BOOSTING',
  FINISHED: 'FINISHED',
};

// ─── Texture ──────────────────────────────────────────────────────────────────

export function generateKartTexture(scene, key, color) {
  if (scene.textures.exists(key)) return;
  const W = 44, H = 28;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(color);
  g.fillRoundedRect(4, 0, W - 8, H, 5);
  g.fillRect(W - 8, 4, 8, H - 8);
  g.fillStyle(0x000000, 0.5);
  g.fillRect(10, 5, W - 18, H - 10);
  g.fillStyle(0xffffaa);
  g.fillRect(W - 10, 4, 5, 6);
  g.fillRect(W - 10, H - 10, 5, 6);
  g.fillStyle(0xff4444);
  g.fillRect(5, 4, 5, 6);
  g.fillRect(5, H - 10, 5, 6);
  g.fillStyle(0x111111);
  g.fillRect(9, -3, 13, 7);
  g.fillRect(W - 22, -3, 13, 7);
  g.fillRect(9, H - 4, 13, 7);
  g.fillRect(W - 22, H - 4, 13, 7);
  g.generateTexture(key, W, H);
  g.destroy();
}

// ─── Base Kart ────────────────────────────────────────────────────────────────

export class Kart {
  constructor(scene, x, y, angle, index, trackData) {
    this.scene     = scene;
    this.index     = index;
    this.trackData = trackData;
    this.color     = KART_COLORS[index];
    this.kartName  = KART_NAMES[index];

    const key = `kart_${index}`;
    generateKartTexture(scene, key, this.color);

    this.sprite = scene.physics.add.sprite(x, y, key);
    this.sprite.setRotation(angle);
    this.sprite.setDepth(10 + index);
    this.sprite.body.setSize(38, 24);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.body.allowGravity = false;

    // ── Car physics (velocity vector, NOT a speed scalar) ──────────────────
    this.vx = 0;
    this.vy = 0;
    // `speed` is a read-only derived value used for HUD / AI queries
    this._speed = 0;

    // ── State machine ──────────────────────────────────────────────────────
    this.state       = STATE.NORMAL;
    this.stateTimer  = 0;
    this.baseMaxSpeed = KART_MAX_SPEED;
    this.maxSpeed     = this.baseMaxSpeed;
    this._crashCooldown = 0;   // ms – prevents repeated crash tint spam

    // ── Item slots ─────────────────────────────────────────────────────────
    this.items = [null, null];

    // ── Race progress ──────────────────────────────────────────────────────
    this.lap           = 0;
    this.nextWpIdx     = 0;
    this.waypointsSeen = 0;
    this.finished      = false;
    this.finishRank    = 0;
    this.finishTime    = 0;
    this.raceStarted   = false;

    this.waypoints = this._buildWaypoints();
  }

  // ── Waypoints ──────────────────────────────────────────────────────────────

  _buildWaypoints() {
    const { centerPoints, waypointCount } = this.trackData;
    const step = Math.max(1, Math.floor(centerPoints.length / waypointCount));
    const wps = [];
    for (let i = 0; i < centerPoints.length; i += step) wps.push(centerPoints[i]);
    return wps;
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  get x()        { return this.sprite.x; }
  get y()        { return this.sprite.y; }
  get rotation() { return this.sprite.rotation; }
  get speed()    { return this._speed; }

  get raceScore() {
    if (this.finished) return Infinity;
    const wp  = this.waypoints[this.nextWpIdx % this.waypoints.length];
    const dist = Math.hypot(this.x - wp.x, this.y - wp.y);
    return this.lap * 100000 + this.waypointsSeen * 1000 - dist;
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  collectItem(type) {
    const empty = this.items.indexOf(null);
    if (empty === -1) return false;
    this.items[empty] = type;
    return true;
  }

  useItem(slot) {
    if (this.state === STATE.STUNNED || this.state === STATE.FINISHED) return null;
    const item = this.items[slot];
    if (!item) return null;
    this.items[slot] = null;
    if (item === 'boost') { this._applyBoost(); return null; }
    return item;
  }

  // ── State setters ──────────────────────────────────────────────────────────

  applyStun() {
    if (this.state === STATE.FINISHED) return;
    this.state      = STATE.STUNNED;
    this.stateTimer = STUN_DURATION;
    this.sprite.setTint(0xffffff);
  }

  applySlide() {
    if (this.state === STATE.STUNNED || this.state === STATE.FINISHED) return;
    this.state      = STATE.SLIDING;
    this.stateTimer = SLIDE_DURATION;
    this.sprite.setTint(0xffff00);
  }

  _applyBoost() {
    this.state      = STATE.BOOSTING;
    this.stateTimer = BOOST_DURATION;
    this.maxSpeed   = this.baseMaxSpeed * BOOST_MULTIPLIER;
    this.sprite.setTint(0xff8800);
  }

  markFinished(rank, time) {
    this.finished   = true;
    this.finishRank = rank;
    this.finishTime = time;
    this.state      = STATE.FINISHED;
    this.vx = 0; this.vy = 0;
    this.sprite.setVelocity(0, 0);
    this.sprite.clearTint();
  }

  // ── Main update ────────────────────────────────────────────────────────────

  update(delta, totalLaps) {
    if (this.finished) return;
    const dt = delta / 1000;

    // Advance state timer
    if (this.stateTimer > 0) {
      this.stateTimer -= delta;
      if (this.stateTimer <= 0) {
        this.stateTimer = 0;
        if (this.state !== STATE.FINISHED) {
          this.state    = STATE.NORMAL;
          this.maxSpeed = this.baseMaxSpeed;
          this.sprite.clearTint();
        }
      }
    }

    // ── Hold still during countdown
    if (!this.raceStarted) {
      this.vx = 0; this.vy = 0;
      this.sprite.setVelocity(0, 0);
      return;
    }

    if (this._crashCooldown > 0) this._crashCooldown -= delta;

    // ── Stunned: skid to a halt, no control
    if (this.state === STATE.STUNNED) {
      this.vx *= 0.85;
      this.vy *= 0.85;
      this.sprite.setVelocity(this.vx, this.vy);
      this._speed = Math.hypot(this.vx, this.vy);
      return;
    }

    // Off-track detection
    const distCenter = distToTrack(this.x, this.y, this.trackData.centerPoints);
    const halfW      = this.trackData.trackWidth * 0.5;
    const onTrack    = distCenter < halfW;
    const effMax     = this.maxSpeed * (onTrack ? 1 : GRASS_SPEED_MULT);

    // ── Sliding: no steering, kart slews sideways, minimal lateral grip
    if (this.state === STATE.SLIDING) {
      // Very light drag, almost no grip — feels like hitting a banana peel
      this._applyLateralFriction(0.15, dt);
      this.vx *= Math.pow(0.97, dt * 60);
      this.vy *= Math.pow(0.97, dt * 60);
      this._wallPushBack(distCenter, halfW);
      this.sprite.setVelocity(this.vx, this.vy);
      this._speed = Math.hypot(this.vx, this.vy);
      if (this.raceStarted) this._checkWaypoints(totalLaps);
      return;
    }

    // ── Normal / Boosting
    this._applyInput(dt, effMax);

    // Lateral friction = what makes it feel like a real car
    // Value is fraction of lateral velocity removed PER SECOND (dt-scaled inside)
    // On grass: less grip → more slide
    this._applyLateralFriction(onTrack ? 0.92 : 0.50, dt);

    // Wall collision: push back + crash bounce
    this._wallPushBack(distCenter, halfW);

    this.sprite.setVelocity(this.vx, this.vy);
    this._speed = Math.hypot(this.vx, this.vy);

    if (this.raceStarted) this._checkWaypoints(totalLaps);
  }

  // ── Car physics internals ──────────────────────────────────────────────────

  /**
   * Lateral friction: removes velocity component perpendicular to the car's
   * facing direction.  `grip` 0=ice, 1=rail.  This is the core of car-feel.
   */
  /**
   * grip = fraction of lateral velocity removed per SECOND (0–1).
   * dt-scaled so it's frame-rate independent.
   * 0.92/s = very grippy (race tyre feel).  0.5/s = drifty (grass).
   */
  _applyLateralFriction(gripPerSec, dt) {
    const fwdX = Math.cos(this.sprite.rotation);
    const fwdY = Math.sin(this.sprite.rotation);
    const latX = -fwdY;
    const latY =  fwdX;
    const latVel = this.vx * latX + this.vy * latY;
    // How much to remove this frame:  1 - (1-grip)^dt
    const remove = 1 - Math.pow(1 - gripPerSec, dt);
    this.vx -= latX * latVel * remove;
    this.vy -= latY * latVel * remove;
  }

  /**
   * If kart is beyond track edge: push position back and bounce velocity.
   */
  _wallPushBack(distCenter, halfW) {
    if (distCenter <= halfW - 4) return;

    const nearest = nearestPointOnTrack(this.x, this.y, this.trackData.centerPoints);
    const dx  = nearest.x - this.x;
    const dy  = nearest.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx  = dx / len;   // direction toward track centre
    const ny  = dy / len;

    if (distCenter > halfW) {
      // Reposition onto edge
      const over = distCenter - halfW + 3;
      this.sprite.x += nx * over;
      this.sprite.y += ny * over;

      // Velocity component moving away from centre → reflect + damp heavily
      const dot = this.vx * nx + this.vy * ny;
      if (dot < 0) {
        // Bounce: reflect + 65% energy loss
        this.vx = (this.vx - 2 * dot * nx) * 0.35;
        this.vy = (this.vy - 2 * dot * ny) * 0.35;
      } else {
        // Already moving toward centre, just damp
        this.vx *= 0.5;
        this.vy *= 0.5;
      }

      // Brief red crash flash
      if (this._crashCooldown <= 0) {
        this._crashCooldown = 300;
        this.sprite.setTint(0xff2222);
        this.scene.time.delayedCall(180, () => {
          if (this.state === STATE.NORMAL || this.state === STATE.BOOSTING) {
            this.sprite.clearTint();
            if (this.state === STATE.BOOSTING) this.sprite.setTint(0xff8800);
          }
        });
      }
    }
  }

  // ── Input helpers (overridden by subclasses) ───────────────────────────────

  _applyInput(_dt, _effMax) {}

  _doSteerLeft(dt) {
    // Steering only effective when the car is actually moving
    const spd    = Math.hypot(this.vx, this.vy);
    const factor = Math.min(1, spd / 80);
    this.sprite.rotation -= KART_TURN_RATE * factor * dt;
  }

  _doSteerRight(dt) {
    const spd    = Math.hypot(this.vx, this.vy);
    const factor = Math.min(1, spd / 80);
    this.sprite.rotation += KART_TURN_RATE * factor * dt;
  }

  _doAccel(dt, effMax) {
    const fwdX = Math.cos(this.sprite.rotation);
    const fwdY = Math.sin(this.sprite.rotation);
    this.vx += fwdX * KART_ACCEL * dt;
    this.vy += fwdY * KART_ACCEL * dt;
    // Clamp to effective max speed
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > effMax) {
      this.vx = (this.vx / spd) * effMax;
      this.vy = (this.vy / spd) * effMax;
    }
  }

  _doBrake(dt) {
    const spd = Math.hypot(this.vx, this.vy);
    if (spd < 12) {
      // Slow enough → allow reversing
      const fwdX = Math.cos(this.sprite.rotation);
      const fwdY = Math.sin(this.sprite.rotation);
      this.vx -= fwdX * KART_ACCEL * 0.45 * dt;
      this.vy -= fwdY * KART_ACCEL * 0.45 * dt;
      const rspd = Math.hypot(this.vx, this.vy);
      if (rspd > KART_REVERSE_MAX) {
        this.vx = (this.vx / rspd) * KART_REVERSE_MAX;
        this.vy = (this.vy / rspd) * KART_REVERSE_MAX;
      }
    } else {
      // Braking deceleration
      const ratio = Math.max(0, 1 - (KART_DECEL * 1.5 * dt) / spd);
      this.vx *= ratio;
      this.vy *= ratio;
    }
  }

  _doCoast(dt) {
    // Gentle drag when no input
    this.vx *= 0.976;
    this.vy *= 0.976;
  }

  // ── Waypoint / lap logic ───────────────────────────────────────────────────

  _checkWaypoints(totalLaps) {
    const wp   = this.waypoints[this.nextWpIdx];
    const dist = Math.hypot(this.x - wp.x, this.y - wp.y);

    if (dist < 75) {
      this.nextWpIdx++;
      this.waypointsSeen++;

      if (this.nextWpIdx >= this.waypoints.length) {
        this.nextWpIdx     = 0;
        this.lap++;
        this.waypointsSeen = 0;
        if (this.lap >= totalLaps) {
          this.scene.events.emit('kartFinished', this);
        }
      }
    }
  }

  destroy() { this.sprite.destroy(); }
}
