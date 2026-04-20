import { Kart } from './Kart.js';

export class PlayerKart extends Kart {
  constructor(scene, x, y, angle, trackData) {
    super(scene, x, y, angle, 0, trackData);

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

  _applyInput(dt, effMax) {
    const cur  = this.cursors;
    const wasd = this.wasd;

    const goLeft  = cur.left.isDown  || wasd.left.isDown;
    const goRight = cur.right.isDown || wasd.right.isDown;
    const goUp    = cur.up.isDown    || wasd.up.isDown;
    const goDown  = cur.down.isDown  || wasd.down.isDown;

    if (goLeft)  this._doSteerLeft(dt);
    if (goRight) this._doSteerRight(dt);

    if (goUp)        this._doAccel(dt, effMax);
    else if (goDown) this._doBrake(dt);
    else             this._doCoast(dt);
  }
}
