import { GAME_WIDTH, GAME_HEIGHT, KART_COLORS } from '../constants.js';

const MEDAL = ['🏆', '🥈', '🥉', '  '];
const BG    = 0x0d0d1a;

function formatTime(ms) {
  const s   = Math.floor(ms / 1000);
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  const mil = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(mil).padStart(2,'0')}`;
}

export class ResultsScene extends Phaser.Scene {
  constructor() { super('ResultsScene'); }

  init(data) {
    this._results  = data.finishOrder || [];
    this._trackIdx = data.trackIdx    || 0;
    this._laps     = data.laps        || 3;
    this._botDifficulty = data.botDifficulty || 'medium';
  }

  create() {
    window.dispatchEvent(new CustomEvent('robokart-controls', { detail: { visible: false } }));
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const results = this._results;

    // ── Background ─────────────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, BG);

    // Decorative lines
    for (let i = 0; i < 10; i++) {
      this.add.rectangle(W * 0.5, 70 + i * 62, W, 1, 0xffffff, 0.04);
    }

    // ── Player outcome header ──────────────────────────────────────────────
    const playerResult = results.find(r => r.isPlayer);
    const playerRank   = playerResult?.rank ?? results.length;

    const won = playerRank === 1;
    const headerTxt = won ? '🏆  YOU WIN!' : `RACE OVER — YOU FINISHED ${playerRank}${['st','nd','rd','th'][Math.min(playerRank - 1, 3)]}`;
    const headerCol = won ? '#ffdd00' : '#ff6666';

    this.add.text(W / 2, 38, headerTxt, {
      fontFamily: 'Impact, monospace',
      fontSize:   '56px',
      color:      headerCol,
      stroke:     '#000',
      strokeThickness: 7,
      shadow: { offsetX: 3, offsetY: 3, color: '#000', blur: 8, fill: true },
    }).setOrigin(0.5);

    // ── Results table header ───────────────────────────────────────────────
    const TABLE_X   = W / 2 - 320;
    const TABLE_Y   = 130;
    const ROW_H     = 62;

    const hdStyle = { fontFamily: 'monospace', fontSize: '14px', color: '#7070a0', letterSpacing: 3 };
    this.add.text(TABLE_X + 50,  TABLE_Y, 'RANK',   hdStyle);
    this.add.text(TABLE_X + 160, TABLE_Y, 'DRIVER', hdStyle);
    this.add.text(TABLE_X + 420, TABLE_Y, 'TIME',   hdStyle);

    // Divider
    this.add.rectangle(W / 2, TABLE_Y + 22, 680, 2, 0x333355);

    // ── Results rows ───────────────────────────────────────────────────────
    results.forEach((r, i) => {
      const rowY     = TABLE_Y + 40 + i * ROW_H;
      const isPlayer = r.isPlayer;
      const rowColor = isPlayer ? 0x1a1a00 : 0x0d0d1a;
      const rowBG    = this.add.rectangle(W / 2, rowY + ROW_H / 2 - 4, 680, ROW_H - 4, rowColor, isPlayer ? 0.9 : 0.4);

      if (isPlayer) {
        rowBG.setStrokeStyle(2, 0xffdd00, 0.7);
      }

      // Animated slide-in
      rowBG.setAlpha(0);
      this.add.tween = this.tweens.add({
        targets:  rowBG,
        alpha:    1,
        x:        { from: W / 2 - 80, to: W / 2 },
        duration: 350,
        delay:    i * 120,
        ease:     'Power2',
      });

      const medal = MEDAL[Math.min(r.rank - 1, 3)];
      const nameCol = isPlayer ? '#ffdd00' : '#ccccff';

      // Rank
      this.add.text(TABLE_X + 10, rowY + 10,
        `${medal}  ${r.rank}`, {
          fontFamily: 'Impact, monospace',
          fontSize:   '28px',
          color:      r.rank === 1 ? '#ffdd00' : r.rank === 2 ? '#cccccc' : r.rank === 3 ? '#cc8833' : '#888888',
        }
      );

      // Colour swatch
      const hex = `#${r.color.toString(16).padStart(6, '0')}`;
      this.add.rectangle(TABLE_X + 155, rowY + 20, 12, 26, r.color);

      // Name
      this.add.text(TABLE_X + 175, rowY + 10, r.name, {
        fontFamily: 'monospace',
        fontSize:   '22px',
        color:      nameCol,
        fontStyle:  isPlayer ? 'bold' : 'normal',
      });

      if (isPlayer) {
        this.add.text(TABLE_X + 330, rowY + 10, '← YOU', {
          fontFamily: 'monospace', fontSize: '14px', color: '#ffdd00',
        });
      }

      // Time
      this.add.text(TABLE_X + 420, rowY + 10, formatTime(r.time), {
        fontFamily: 'monospace',
        fontSize:   '20px',
        color:      '#aaffaa',
      });
    });

    // ── Buttons ───────────────────────────────────────────────────────────
    const btnY = TABLE_Y + 50 + results.length * ROW_H + 30;

    // Race Again (same settings)
    this._makeBtn(W / 2 - 160, btnY, 230, 52, '▶ RACE AGAIN', '#22aa44', () => {
      this.scene.start('RaceScene', {
        numPlayers: results.length,
        trackIdx:   this._trackIdx,
        laps:       this._laps,
        botDifficulty: this._botDifficulty,
      });
    });

    // Main Menu
    this._makeBtn(W / 2 + 110, btnY, 200, 52, '⬅ MENU', '#2255cc', () => {
      this.scene.start('MenuScene');
    });

    // ── Confetti for winner ───────────────────────────────────────────────
    if (won) this._spawnConfetti();
  }

  _makeBtn(x, y, w, h, label, bgHex, cb) {
    const color = parseInt(bgHex.replace('#', ''), 16);
    const bg = this.add.rectangle(x + w / 2, y + h / 2, w, h, color)
      .setInteractive({ useHandCursor: true });
    this.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5);

    bg.on('pointerover',  () => bg.setAlpha(0.75));
    bg.on('pointerout',   () => bg.setAlpha(1));
    bg.on('pointerup',    cb);
  }

  _spawnConfetti() {
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const colors = [0xffdd00, 0xff4444, 0x44ff88, 0x44aaff, 0xff88ff, 0xffffff];
    const gfx    = this.add.graphics().setDepth(200);

    let t = 0;
    const pieces = Array.from({ length: 60 }, () => ({
      x: Math.random() * W,
      y: Math.random() * -H,
      vx: (Math.random() - 0.5) * 60,
      vy: 60 + Math.random() * 90,
      rot: Math.random() * Math.PI * 2,
      rSpeed: (Math.random() - 0.5) * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
    }));

    const timer = this.time.addEvent({
      delay:    16,
      repeat:   180,
      callback: () => {
        t += 0.016;
        gfx.clear();
        pieces.forEach(p => {
          p.x   += p.vx * 0.016;
          p.y   += p.vy * 0.016;
          p.rot += p.rSpeed * 0.016;
          if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
          gfx.fillStyle(p.color, 0.85);
          gfx.save();
          gfx.translateCanvas(p.x, p.y);
          gfx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          gfx.restore();
        });
      },
    });
  }
}
