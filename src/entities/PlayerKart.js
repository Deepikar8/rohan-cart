import { Kart } from './Kart.js';

export class PlayerKart extends Kart {
  constructor(scene, x, y, angle, trackData) {
    super(scene, x, y, angle, 0, trackData);
    this.mobileControls = window.__robokartMobile || null;

    // Player handling is a little more forgiving than the bot physics.
    this.turnRateMultiplier = 1.18;
    this.lowSpeedTurnAssist = 0.62;
    this.turnAssistFullSpeed = 145;
    this.onTrackGrip = 0.975;
    this.offTrackGrip = 0.60;
    this.coastDragPerFrame = 0.982;
    this.reverseEngageSpeed = 44;
    this.reverseAccelMultiplier = 0.92;
    this.reverseLateralGrip = 0.7;

    // Cursor keys + WASD
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.wasd = scene.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Item-use keys: Z = slot 1, X = slot 2
    this.keyZ = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    // Track key-just-pressed to avoid repeated firing on hold
    this.keyZ.on('down', () => { this._useSlot(0); });
    this.keyX.on('down', () => { this._useSlot(1); });
  }

  _useSlot(slot) {
    if (!this.raceStarted || this.finished) return;
    const item = this.useItem(slot);
    if (item) {
      this.scene.events.emit('playerUsedItem', { item, kart: this, slot });
    }
  }

  _consumeMobileTap(key) {
    const taps = this.mobileControls?.taps;
    if (!taps || !taps[key]) return false;
    taps[key] -= 1;
    return true;
  }

  _applyInput(dt, effMax) {
    const cur  = this.cursors;
    const wasd = this.wasd;
    const touch = this.mobileControls?.hold || {};

    if (this._consumeMobileTap('item1')) this._useSlot(0);
    if (this._consumeMobileTap('item2')) this._useSlot(1);
    if (this._consumeMobileTap('camera')) this.scene._toggleCameraMode?.();

    const goLeft  = cur.left.isDown  || wasd.left.isDown  || touch.left;
    const goRight = cur.right.isDown || wasd.right.isDown || touch.right;
    const goUp    = cur.up.isDown    || wasd.up.isDown    || touch.up;
    const goDown  = cur.down.isDown  || wasd.down.isDown  || touch.down;

    if (goLeft)  this._doSteerLeft(dt);
    if (goRight) this._doSteerRight(dt);

    if (goUp)        this._doAccel(dt, effMax);
    else if (goDown) this._doBrake(dt);
    else             this._doCoast(dt);
  }
}
