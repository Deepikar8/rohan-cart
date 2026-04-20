import { GAME_WIDTH, GAME_HEIGHT, ITEM_WEIGHTS, ITEM_BOX_RESPAWN, START_GRID } from '../constants.js';
import { TRACKS, itemBoxPositions, distToTrack } from '../tracks/TrackData.js';
import { PlayerKart } from '../entities/PlayerKart.js';
import { RobotKart }  from '../entities/RobotKart.js';
import { Shell }      from '../items/Shell.js';
import { Banana }     from '../items/Banana.js';

const COUNTDOWN_TICKS = [3, 2, 1];  // seconds
const POST_FINISH_WAIT = 8000;      // ms after last bot finishes → results
const CAMERA_PADDING = 260;

// ─── Random item from weighted table ─────────────────────────────────────────

function randomItem() {
  const r   = Math.random() * 100;
  const { shell, banana, boost } = ITEM_WEIGHTS;
  if (r < shell)                  return 'shell';
  if (r < shell + banana)         return 'banana';
  return 'boost';
}

// ─── Item-box texture ─────────────────────────────────────────────────────────

function ensureItemBoxTexture(scene) {
  if (scene.textures.exists('itembox')) return;
  const S = 28;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffd700);
  g.fillRect(0, 0, S, S);
  g.fillStyle(0xff8800);
  g.fillRect(3, 3, S - 6, S - 6);
  g.fillStyle(0xffffff);
  g.setFont && g.setFont('bold 16px monospace');
  // Draw "?" as a filled cross shape
  g.fillRect(10, 6, 8, 3);
  g.fillRect(14, 9, 4, 7);
  g.fillRect(10, 18, 8, 3);
  g.fillRect(12, 21, 4, 3);
  g.generateTexture('itembox', S, S);
  g.destroy();
}

// ─── Draw track to Graphics object ───────────────────────────────────────────

function drawTrack(scene, track) {
  const { centerPoints, trackWidth, worldWidth, worldHeight,
          grassColor, roadColor, curbColor } = track;

  const g = scene.add.graphics();
  g.setDepth(0);

  // Grass background
  g.fillStyle(grassColor);
  g.fillRect(-CAMERA_PADDING, -CAMERA_PADDING,
    worldWidth + CAMERA_PADDING * 2,
    worldHeight + CAMERA_PADDING * 2
  );

  // Helper: draw each segment as individual thick rounded rectangles
  // so corners NEVER get miter-spike artifacts regardless of angle.
  const drawRoundedTrack = (color, width, alpha = 1) => {
    const n    = centerPoints.length;
    const half = width / 2;
    g.fillStyle(color, alpha);
    for (let i = 0; i < n; i++) {
      const a = centerPoints[i];
      const b = centerPoints[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      // Perpendicular
      const px = (-dy / len) * half, py = (dx / len) * half;
      // Four corners of this road segment quad
      g.fillPoints([
        { x: a.x + px, y: a.y + py },
        { x: b.x + px, y: b.y + py },
        { x: b.x - px, y: b.y - py },
        { x: a.x - px, y: a.y - py },
      ], true);
    }
    // Also fill circles at each vertex so gaps between quads disappear
    for (const p of centerPoints) {
      g.fillCircle(p.x, p.y, half);
    }
  };

  // Curb layer
  drawRoundedTrack(curbColor, trackWidth + 18);
  // White edge stripe
  drawRoundedTrack(0xdddddd, trackWidth + 6);
  // Road surface
  drawRoundedTrack(roadColor, trackWidth);

  // Centre line (dashed)
  {
    const n = centerPoints.length;
    let counter = 0;
    g.lineStyle(4, 0xffffff, 0.5);
    g.beginPath();
    for (let i = 0; i < n; i += 2) {
      const p = centerPoints[i];
      if (counter % 2 === 0) g.moveTo(p.x, p.y);
      else                    g.lineTo(p.x, p.y);
      counter++;
    }
    g.strokePath();
  }

  // Start / finish line  (perpendicular thick white stripe at startPos)
  {
    const { x: sx, y: sy, angle: sa } = track.startPos;
    const px = Math.sin(sa) * (trackWidth / 2);  // perpendicular offset
    const py = -Math.cos(sa) * (trackWidth / 2);

    // Chequered: alternating black/white across the track width
    const steps = 6;
    for (let k = 0; k < steps; k++) {
      const t0 = (k / steps) - 0.5, t1 = ((k + 1) / steps) - 0.5;
      const x0 = sx + px * t0 * 2, y0 = sy + py * t0 * 2;
      const x1 = sx + px * t1 * 2, y1 = sy + py * t1 * 2;
      g.fillStyle(k % 2 === 0 ? 0xffffff : 0x000000);
      g.fillRect(
        Math.min(x0, x1) - 4, Math.min(y0, y1) - 4,
        Math.abs(x1 - x0) + 8, Math.abs(y1 - y0) + 8
      );
    }
  }

  return g;
}

// ─── RaceScene ────────────────────────────────────────────────────────────────

export class RaceScene extends Phaser.Scene {
  constructor() { super('RaceScene'); }

  init(data) {
    this._numPlayers = data.numPlayers || 3;
    this._trackIdx   = data.trackIdx   || 0;
    this._totalLaps  = data.laps       || 3;
    this._botDifficulty = data.botDifficulty || 'medium';
  }

  create() {
    const track      = TRACKS[this._trackIdx];
    this._track      = track;
    this._karts      = [];
    this._shells     = [];
    this._bananas    = [];
    this._itemBoxes  = [];
    this._worldObjects = [];
    this._hudObjects   = [];
    this._finishOrder = [];
    this._raceActive  = false;
    this._postFinish  = false;
    this._raceTime    = 0;
    this._cameraMode  = 'chase';
    this._targetZoom  = 1.08;

    // Physics world bounds
    this.physics.world.setBounds(0, 0, track.worldWidth, track.worldHeight);

    // ── Draw static track ──────────────────────────────────────────────────
    this._registerWorldObject(drawTrack(this, track));

    // ── Spawn karts at start grid ──────────────────────────────────────────
    this._spawnKarts(track);

    // ── Spawn item boxes ───────────────────────────────────────────────────
    this._spawnItemBoxes(track);

    // ── Camera ────────────────────────────────────────────────────────────
    const player = this._karts[0];
    this._cameraTarget = this.add.zone(player.x, player.y, 1, 1);
    this._registerWorldObject(this._cameraTarget);
    this.cameras.main.startFollow(this._cameraTarget, true, 0.08, 0.08);
    this.cameras.main.setBounds(
      -CAMERA_PADDING,
      -CAMERA_PADDING,
      track.worldWidth + CAMERA_PADDING * 2,
      track.worldHeight + CAMERA_PADDING * 2
    );
    this._setCameraMode('chase', false);
    this._createHudCamera();

    this._viewToggleKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    this._viewToggleKey.on('down', () => this._toggleCameraMode());

    // ── HUD ────────────────────────────────────────────────────────────────
    this._buildHUD();

    // ── Item events ────────────────────────────────────────────────────────
    this.events.on('playerUsedItem', ({ item, kart }) => this._spawnItem(item, kart));
    this.events.on('kartFinished',   kart             => this._onKartFinished(kart));

    // ── Countdown ─────────────────────────────────────────────────────────
    this._startCountdown();
  }

  _registerWorldObject(obj) {
    if (!obj) return obj;
    if (Array.isArray(obj)) {
      obj.forEach(entry => this._registerWorldObject(entry));
      return obj;
    }
    this._worldObjects.push(obj);
    if (this._uiCamera) this._uiCamera.ignore(obj);
    return obj;
  }

  _registerHudObject(obj) {
    if (!obj) return obj;
    if (Array.isArray(obj)) {
      obj.forEach(entry => this._registerHudObject(entry));
      return obj;
    }
    this._hudObjects.push(obj);
    this.cameras.main.ignore(obj);
    return obj;
  }

  _createHudCamera() {
    this._uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this._uiCamera.setRoundPixels(true);
    this._uiCamera.ignore(this._worldObjects);
  }

  // ── Kart spawning ──────────────────────────────────────────────────────────

  _spawnKarts(track) {
    const { x: sx, y: sy, angle: sa } = track.startPos;
    const cos = Math.cos(sa), sin = Math.sin(sa);
    // Perpendicular direction (left of travel)
    const px = -sin, py = cos;

    for (let i = 0; i < this._numPlayers; i++) {
      const grid = START_GRID[i];
      const wx   = sx + cos * grid.row + px * grid.col;
      const wy   = sy + sin * grid.row + py * grid.col;

      let kart;
      if (i === 0) {
        kart = new PlayerKart(this, wx, wy, sa, track);
      } else {
        kart = new RobotKart(this, wx, wy, sa, i, track, this._botDifficulty);
      }
      this._karts.push(kart);
      this._registerWorldObject(kart.sprite);
    }
  }

  // ── Item boxes ─────────────────────────────────────────────────────────────

  _spawnItemBoxes(track) {
    ensureItemBoxTexture(this);
    const positions = itemBoxPositions(track.centerPoints, track.itemFractions);

    positions.forEach(pos => {
      const box = this.physics.add.staticSprite(pos.x, pos.y, 'itembox');
      box.setDepth(6);
      box.setData('alive', true);
      box.setData('respawnTimer', 0);

      // Spin animation
      this.tweens.add({
        targets:  box,
        rotation: Math.PI * 2,
        duration: 2200,
        repeat:   -1,
        ease:     'Linear',
      });

      this._itemBoxes.push(box);
      this._registerWorldObject(box);
    });
  }

  // ── Countdown sequence ─────────────────────────────────────────────────────

  _startCountdown() {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const txt = this._registerHudObject(this.add.text(W / 2, H / 2 - 40, '', {
      fontFamily: 'Impact, monospace',
      fontSize:   '120px',
      color:      '#ffdd00',
      stroke:     '#000',
      strokeThickness: 10,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100));

    let tick = 0;
    const sequence = [...COUNTDOWN_TICKS, 'GO!'];

    const doTick = () => {
      const val = sequence[tick];
      txt.setText(String(val));
      txt.setScale(1);
      txt.setAlpha(1);
      txt.setColor(val === 'GO!' ? '#00ff88' : '#ffdd00');

      this.tweens.add({
        targets:  txt,
        scaleX:   2,
        scaleY:   2,
        alpha:    0,
        duration: 750,
        ease:     'Power2',
      });

      tick++;
      if (tick < sequence.length) {
        this.time.delayedCall(900, doTick);
      } else {
        // Race starts
        this.time.delayedCall(300, () => {
          this._raceActive = true;
          this._karts.forEach(k => { k.raceStarted = true; });
          txt.destroy();
        });
      }
    };
    this.time.delayedCall(400, doTick);
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  _buildHUD() {
    const s = { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
                stroke: '#000000', strokeThickness: 3 };
    const W = GAME_WIDTH;
    const hudY = 20;

    this._registerHudObject(
      this.add.rectangle(W / 2 - 120, hudY + 14, 220, 44, 0x000000, 0.45)
        .setScrollFactor(0).setDepth(89)
    );
    this._registerHudObject(
      this.add.rectangle(W / 2 + 120, hudY + 14, 220, 44, 0x000000, 0.45)
        .setScrollFactor(0).setDepth(89)
    );

    // Lap counter
    this._lapTxt = this._registerHudObject(
      this.add.text(W / 2 - 120, hudY, '', s)
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(90)
    );

    // Position indicator
    this._posTxt = this._registerHudObject(this.add.text(W / 2 + 120, hudY, '', {
      ...s, fontSize: '22px', color: '#ffdd00',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(90));

    // Speed indicator (bottom-right)
    this._speedTxt = this._registerHudObject(this.add.text(W - 20, GAME_HEIGHT - 20, '', {
      ...s, fontSize: '16px', color: '#aaffaa',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(90));

    this._cameraTxt = this._registerHudObject(this.add.text(W - 20, GAME_HEIGHT - 46, '', {
      ...s, fontSize: '13px', color: '#aaccff',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(90));

    // Item slots panel (bottom-left)
    this._buildItemHUD();

    // Minimap (top-right)
    this._buildMinimap();

    // Race notification (centre, transient)
    this._notifyTxt = this._registerHudObject(this.add.text(W / 2, 90, '', {
      fontFamily: 'Impact, monospace', fontSize: '32px', color: '#ff4444',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(95).setAlpha(0));
  }

  _buildItemHUD() {
    const slotSize = 52;
    const padding  = 16;
    const baseX    = 20;
    const baseY    = GAME_HEIGHT - 20 - slotSize;

    this._itemSlotBg  = [];
    this._itemSlotTxt = [];

    for (let i = 0; i < 2; i++) {
      const x = baseX + i * (slotSize + 6);
      this._registerHudObject(
        this.add.rectangle(x + slotSize / 2, baseY + slotSize / 2, slotSize, slotSize, 0x000000, 0.65)
          .setScrollFactor(0).setDepth(90)
      );
      this._registerHudObject(
        this.add.rectangle(x + slotSize / 2, baseY + slotSize / 2, slotSize, slotSize)
          .setStrokeStyle(2, 0xffffff, 0.5).setScrollFactor(0).setDepth(90)
      );

      const label = this._registerHudObject(this.add.text(x + slotSize / 2, baseY + slotSize / 2, '', {
        fontFamily: 'monospace', fontSize: '24px', color: '#ffffff',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(91));

      // Key hint
      this._registerHudObject(this.add.text(x + slotSize / 2, baseY - 16, i === 0 ? '[Z]' : '[X]', {
        fontFamily: 'monospace', fontSize: '12px', color: '#aaaaaa',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(90));

      this._itemSlotTxt.push(label);
    }
  }

  _buildMinimap() {
    const track   = this._track;
    const MM_W    = 170, MM_H = 110;
    const MM_X    = GAME_WIDTH - MM_W - 14;
    const MM_Y    = 14;

    // Background
    this._registerHudObject(
      this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W + 8, MM_H + 8, 0x000000, 0.75)
        .setScrollFactor(0).setDepth(88)
    );
    this._registerHudObject(
      this.add.rectangle(MM_X + MM_W / 2, MM_Y + MM_H / 2, MM_W, MM_H, 0x000000, 0.0)
        .setStrokeStyle(2, 0xffffff, 0.4).setScrollFactor(0).setDepth(88)
    );

    // Track outline on minimap (drawn once)
    const mmGfx = this._registerHudObject(this.add.graphics().setScrollFactor(0).setDepth(89));
    const sx     = MM_W / track.worldWidth;
    const sy     = MM_H / track.worldHeight;
    mmGfx.lineStyle(Math.round(track.trackWidth * Math.min(sx, sy) * 0.9), 0x666666);
    mmGfx.beginPath();
    track.centerPoints.forEach((p, i) => {
      const mx = MM_X + p.x * sx, my = MM_Y + p.y * sy;
      if (i === 0) mmGfx.moveTo(mx, my);
      else         mmGfx.lineTo(mx, my);
    });
    mmGfx.closePath();
    mmGfx.strokePath();

    this._mmGfx  = mmGfx;
    this._mmKartDots = [];
    this._MM = { x: MM_X, y: MM_Y, w: MM_W, h: MM_H,
                 sx, sy };

    // Kart dots on minimap
    this._karts.forEach((kart, i) => {
      const dot = this._registerHudObject(
        this.add.circle(0, 0, i === 0 ? 5 : 4, kart.color)
          .setScrollFactor(0).setDepth(91)
      );
      this._mmKartDots.push(dot);
    });
  }

  // ── Item spawning ──────────────────────────────────────────────────────────

  _spawnItem(itemType, kart) {
    const angle  = kart.sprite.rotation;
    const frontX = kart.x + Math.cos(angle) * 30;
    const frontY = kart.y + Math.sin(angle) * 30;
    const rearX  = kart.x - Math.cos(angle) * 30;
    const rearY  = kart.y - Math.sin(angle) * 30;

    if (itemType === 'shell') {
      const shell = new Shell(this, frontX, frontY, angle, this._track, kart);
      this._shells.push(shell);
      this._registerWorldObject(shell.sprite);
    } else if (itemType === 'banana') {
      const banana = new Banana(this, rearX, rearY, kart);
      this._bananas.push(banana);
      this._registerWorldObject(banana.sprite);
    }
    // boost is handled inside kart itself
  }

  // ── Race finish logic ──────────────────────────────────────────────────────

  _onKartFinished(kart) {
    if (kart.finished) return;  // guard double-fire

    const rank = this._finishOrder.length + 1;
    kart.markFinished(rank, this._raceTime);
    this._finishOrder.push(kart);

    // Notification
    const isPlayer = kart.index === 0;
    const msgs = ['1ST 🏆', '2ND 🥈', '3RD 🥉', `${rank}TH`];
    const msgTxt = `${isPlayer ? 'YOU FINISHED' : kart.kartName + ' FINISHED'} — ${msgs[rank - 1] || rank + 'TH'}`;
    this._showNotification(msgTxt, isPlayer ? '#ffdd00' : '#aaaaff', 2500);

    // Stop camera follow if player finished
    if (isPlayer) {
      this.cameras.main.stopFollow();
    }

    // Check if everyone done or schedule post-finish
    const allDone = this._karts.every(k => k.finished);
    if (allDone) {
      this.time.delayedCall(1800, () => this._goToResults());
    } else if (rank === 1) {
      // First finisher: start timeout for remaining
      this.time.delayedCall(POST_FINISH_WAIT, () => {
        if (!this._postFinish) { this._postFinish = true; this._goToResults(); }
      });
    }
  }

  _showNotification(msg, color = '#ffffff', duration = 2000) {
    this._notifyTxt.setText(msg).setColor(color).setAlpha(1).setScale(1);
    this.tweens.killTweensOf(this._notifyTxt);
    this.tweens.add({
      targets:  this._notifyTxt,
      alpha:    0,
      scaleX:   1.3,
      scaleY:   1.3,
      duration,
      ease:     'Power1',
      delay:    duration * 0.5,
    });
  }

  _toggleCameraMode() {
    this._setCameraMode(this._cameraMode === 'chase' ? 'driver' : 'chase');
  }

  _setCameraMode(mode, notify = true) {
    this._cameraMode = mode;
    const player = this._karts?.[0];
    if (mode === 'driver') {
      this._targetZoom = 1.9;
      this.cameras.main.setZoom(this._targetZoom);
      if (player) player.sprite.setAlpha(0.2);
      if (notify && this._notifyTxt) this._showNotification('DRIVER POV', '#88ddff', 1400);
    } else {
      this._targetZoom = 1.08;
      this.cameras.main.setZoom(this._targetZoom);
      if (player) player.sprite.setAlpha(1);
      if (notify && this._notifyTxt) this._showNotification('CHASE CAM', '#88ddff', 1400);
    }
  }

  _updateCameraTarget() {
    const player = this._karts[0];
    if (!player || !this._cameraTarget) return;

    const lookAhead = this._cameraMode === 'driver' ? 140 : 0;
    this._cameraTarget.x = player.x + Math.cos(player.rotation) * lookAhead;
    this._cameraTarget.y = player.y + Math.sin(player.rotation) * lookAhead;
  }

  _updateCameraZoom(delta) {
    const player = this._karts[0];
    if (!player) return;

    let desiredZoom = this._targetZoom;
    if (this._cameraMode === 'chase') {
      const nearEdge = Math.min(
        player.x,
        this._track.worldWidth - player.x,
        player.y,
        this._track.worldHeight - player.y
      );
      if (nearEdge < 240) {
        const t = Phaser.Math.Clamp((240 - nearEdge) / 240, 0, 1);
        desiredZoom = Phaser.Math.Linear(this._targetZoom, 0.92, t);
      }
    }

    const currentZoom = this.cameras.main.zoom;
    const zoomLerp = 1 - Math.pow(0.001, delta / 1000);
    this.cameras.main.setZoom(Phaser.Math.Linear(currentZoom, desiredZoom, zoomLerp));
  }

  _goToResults() {
    // Force-finish any still-racing karts in the order of their race score
    const unfinished = this._karts
      .filter(k => !k.finished)
      .sort((a, b) => b.raceScore - a.raceScore);
    unfinished.forEach(k => {
      const rank = this._finishOrder.length + 1;
      k.markFinished(rank, this._raceTime);
      this._finishOrder.push(k);
    });

    this.scene.start('ResultsScene', {
      finishOrder: this._finishOrder.map(k => ({
        name:      k.kartName,
        index:     k.index,
        color:     k.color,
        rank:      k.finishRank,
        time:      k.finishTime,
        isPlayer:  k.index === 0,
      })),
      trackIdx: this._trackIdx,
      laps:     this._totalLaps,
      botDifficulty: this._botDifficulty,
    });
  }

  // ── Main update ────────────────────────────────────────────────────────────

  update(_time, delta) {
    if (this._raceActive) this._raceTime += delta;

    // ── Update karts ───────────────────────────────────────────────────────
    const ranks = this._computeRanks();
    this._karts.forEach((kart, i) => {
      kart.update(delta, this._totalLaps);

      // Robot item AI
      if (kart instanceof RobotKart) {
        const result = kart.tickItemAI(delta, this._karts, ranks[i], this._karts.length);
        if (result) this._spawnItem(result.item, result.kart);
      }
    });

    this._updateCameraTarget();
    this._updateCameraZoom(delta);

    // ── Update shells ──────────────────────────────────────────────────────
    this._shells = this._shells.filter(s => s.alive);
    this._shells.forEach(shell => {
      shell.update(delta);
      if (!shell.alive) return;
      // Check collision with karts
      this._karts.forEach(kart => {
        if (kart === shell.owner || kart.finished) return;
        if (Math.hypot(shell.x - kart.x, shell.y - kart.y) < 28) {
          shell.onHitKart(kart);
        }
      });
    });

    // ── Update bananas ─────────────────────────────────────────────────────
    this._bananas = this._bananas.filter(b => b.alive);
    this._bananas.forEach(banana => {
      banana.update(delta);
      if (!banana.alive) return;
      this._karts.forEach(kart => {
        if (kart.finished) return;
        if (!banana.canHit(kart)) return;
        if (Math.hypot(banana.x - kart.x, banana.y - kart.y) < 24) {
          banana.onHitKart(kart);
        }
      });
    });

    // ── Item box collection ────────────────────────────────────────────────
    this._updateItemBoxes(delta);

    // ── HUD refresh ────────────────────────────────────────────────────────
    this._refreshHUD(ranks);
  }

  _computeRanks() {
    const sorted = [...this._karts].sort((a, b) => b.raceScore - a.raceScore);
    const rankOf  = new Map(sorted.map((k, i) => [k, i + 1]));
    return this._karts.map(k => rankOf.get(k));
  }

  _updateItemBoxes(delta) {
    this._itemBoxes.forEach(box => {
      // Respawn logic
      if (!box.getData('alive')) {
        const t = box.getData('respawnTimer') - delta;
        box.setData('respawnTimer', t);
        if (t <= 0) {
          box.setData('alive', true);
          box.setActive(true).setVisible(true);
          box.refreshBody();
          // Pop-in animation
          box.setScale(0);
          this.tweens.add({
            targets:  box,
            scaleX:   1,
            scaleY:   1,
            duration: 400,
            ease:     'Back.out',
          });
        }
        return;
      }

      // Collect check
      this._karts.forEach(kart => {
        if (kart.finished) return;
        if (!box.getData('alive')) return;
        const dist = Math.hypot(box.x - kart.x, box.y - kart.y);
        if (dist < 30) {
          const collected = kart.collectItem(randomItem());
          if (collected) {
            box.setData('alive', false);
            box.setData('respawnTimer', ITEM_BOX_RESPAWN);
            box.setActive(false).setVisible(false);
          }
        }
      });
    });
  }

  _refreshHUD(ranks) {
    const player = this._karts[0];
    const rank   = ranks[0];
    const suffix = ['st','nd','rd','th'][Math.min(rank - 1, 3)];
    const lap    = Math.min(player.lap + 1, this._totalLaps);

    this._lapTxt.setText(`Lap  ${lap} / ${this._totalLaps}`);
    this._posTxt.setText(`${rank}${suffix}  of  ${this._karts.length}`);
    this._speedTxt.setText(`${Math.abs(Math.round(player.speed))} km/h`);
    this._cameraTxt.setText(`[C] ${this._cameraMode === 'driver' ? 'Driver POV' : 'Chase Cam'}`);

    // Item slots
    const icons = { shell: '🟢', banana: '🍌', boost: '🔥' };
    for (let i = 0; i < 2; i++) {
      const item = player.items[i];
      this._itemSlotTxt[i].setText(item ? icons[item] : '');
    }

    // Minimap kart dots
    const { x: mx, y: my, sx, sy } = this._MM;
    this._karts.forEach((kart, i) => {
      const dot = this._mmKartDots[i];
      dot.setPosition(mx + kart.x * sx, my + kart.y * sy);
    });
  }
}
