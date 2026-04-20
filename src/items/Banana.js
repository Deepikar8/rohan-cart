import { BANANA_LIFETIME } from '../constants.js';

const B_W = 22, B_H = 14;

/** Generate banana peel texture once. */
function ensureBananaTexture(scene) {
  if (scene.textures.exists('banana')) return;
  const g = scene.make.graphics({ add: false });
  // Peel body
  g.fillStyle(0xffdd00);
  g.fillEllipse(B_W / 2, B_H / 2, B_W, B_H);
  // Dark tips
  g.fillStyle(0x886600);
  g.fillCircle(2, B_H / 2, 3);
  g.fillCircle(B_W - 2, B_H / 2, 3);
  // Highlight streak
  g.fillStyle(0xffff88, 0.6);
  g.fillEllipse(B_W / 2, B_H / 2 - 2, B_W * 0.5, 3);
  g.generateTexture('banana', B_W, B_H);
  g.destroy();
}

export class Banana {
  /**
   * @param {Phaser.Scene} scene
   * @param {number}       x      World x (placed BEHIND the kart)
   * @param {number}       y      World y
   * @param {Kart}         owner  The kart that dropped it
   */
  constructor(scene, x, y, owner) {
    this.scene    = scene;
    this.owner    = owner;
    this.alive    = true;
    this.lifetime = BANANA_LIFETIME;

    // Brief immunity window so the dropper doesn't instantly slide
    this._immunityTimer = 800;  // ms

    ensureBananaTexture(scene);
    this.sprite = scene.physics.add.staticSprite(x, y, 'banana');
    this.sprite.setDepth(5);
    this.sprite.setRotation(Math.random() * Math.PI * 2);  // random orientation
    this.sprite.refreshBody();

    // Wobble animation for visibility
    scene.tweens.add({
      targets:  this.sprite,
      scaleX:   1.15,
      scaleY:   0.85,
      duration: 300,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  update(delta) {
    if (!this.alive) return;
    if (this._immunityTimer > 0) this._immunityTimer -= delta;
    this.lifetime -= delta;
    if (this.lifetime <= 0) this.destroy();
  }

  /** Returns true if this kart can trigger the banana. */
  canHit(kart) {
    return this.alive
        && !(kart === this.owner && this._immunityTimer > 0);
  }

  onHitKart(kart) {
    if (!this.alive) return;
    kart.applySlide();
    this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;

    // Quick pop effect
    this.scene.tweens.add({
      targets:  this.sprite,
      scaleX:   2.5,
      scaleY:   2.5,
      alpha:    0,
      duration: 250,
      ease:     'Power2',
      onComplete: () => this.sprite.destroy(),
    });
  }
}
