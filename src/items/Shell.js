import { SHELL_SPEED, SHELL_MAX_BOUNCES, SHELL_LIFETIME } from '../constants.js';
import { distToTrack, nearestSegmentNormal } from '../tracks/TrackData.js';

const SHELL_RADIUS = 10;

/** Generate shell texture once per scene. */
function ensureShellTexture(scene) {
  if (scene.textures.exists('shell')) return;
  const g = scene.make.graphics({ add: false });
  // Outer shell
  g.fillStyle(0x22bb22);
  g.fillCircle(SHELL_RADIUS, SHELL_RADIUS, SHELL_RADIUS);
  // Highlight
  g.fillStyle(0x55ff55);
  g.fillCircle(SHELL_RADIUS - 3, SHELL_RADIUS - 3, 4);
  // Dark swirl hint
  g.fillStyle(0x006600, 0.5);
  g.fillCircle(SHELL_RADIUS + 2, SHELL_RADIUS + 2, 3);
  g.generateTexture('shell', SHELL_RADIUS * 2, SHELL_RADIUS * 2);
  g.destroy();
}

export class Shell {
  /**
   * @param {Phaser.Scene} scene
   * @param {number}       x           Spawn world x
   * @param {number}       y           Spawn world y
   * @param {number}       angle       Direction in radians
   * @param {object}       trackData   Track definition
   * @param {Kart}         owner       The kart that fired it
   */
  constructor(scene, x, y, angle, trackData, owner) {
    this.scene     = scene;
    this.trackData = trackData;
    this.owner     = owner;
    this.alive     = true;
    this.bounces   = 0;
    this.lifetime  = SHELL_LIFETIME;

    // Velocity vector
    this.vx = Math.cos(angle) * SHELL_SPEED;
    this.vy = Math.sin(angle) * SHELL_SPEED;

    ensureShellTexture(scene);
    this.sprite = scene.physics.add.sprite(x, y, 'shell');
    this.sprite.setDepth(8);
    this.sprite.setCircle(SHELL_RADIUS);
    this.sprite.body.allowGravity = false;
    this.sprite.setVelocity(this.vx, this.vy);

    // Spin effect
    this._rotationRate = 6;   // rad/s
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  update(delta) {
    if (!this.alive) return;

    const dt = delta / 1000;
    this.lifetime -= delta;

    if (this.lifetime <= 0) { this.destroy(); return; }

    // Animate rotation
    this.sprite.rotation += this._rotationRate * dt;

    // Check if off track → bounce
    const dist = distToTrack(this.sprite.x, this.sprite.y, this.trackData.centerPoints);
    const halfW = this.trackData.trackWidth * 0.5;

    if (dist > halfW) {
      // Reflect velocity off nearest segment normal
      const n   = nearestSegmentNormal(this.sprite.x, this.sprite.y, this.trackData.centerPoints);
      const dot = this.vx * n.x + this.vy * n.y;
      this.vx  -= 2 * dot * n.x;
      this.vy  -= 2 * dot * n.y;

      this.sprite.setVelocity(this.vx, this.vy);

      // Push back onto track slightly
      this.sprite.x += n.x * 8;
      this.sprite.y += n.y * 8;

      this.bounces++;
      if (this.bounces >= SHELL_MAX_BOUNCES) { this.destroy(); return; }

      // Brief flash on bounce
      this.sprite.setTint(0xffffff);
      this.scene.time.delayedCall(80, () => {
        if (this.alive) this.sprite.clearTint();
      });
    }
  }

  /** Called when shell hits a kart. */
  onHitKart(kart) {
    if (!this.alive) return;
    kart.applyStun();
    this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;

    // Burst particle effect (manual using graphics)
    const burst = this.scene.add.graphics();
    if (this.scene._registerWorldObject) this.scene._registerWorldObject(burst);
    burst.fillStyle(0x44ff44);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      burst.fillCircle(
        this.sprite.x + Math.cos(a) * 12,
        this.sprite.y + Math.sin(a) * 12,
        4
      );
    }
    burst.setDepth(20);
    this.scene.time.delayedCall(200, () => burst.destroy());

    this.sprite.destroy();
  }
}
