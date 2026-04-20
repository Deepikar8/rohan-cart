import { GAME_WIDTH, GAME_HEIGHT, BOT_DIFFICULTIES } from '../constants.js';
import { TRACKS } from '../tracks/TrackData.js';

const BG       = 0x0d0d1a;
const PANEL    = 0x1a1a2e;
const ACCENT   = 0xe94560;
const GOLD     = 0xf5c518;
const TEXT_CLR = '#e8e8ff';
const DIM_CLR  = '#7070a0';

// ─── Helper: create a styled button ──────────────────────────────────────────

function makeBtn(scene, x, y, w, h, label, callback) {
  const bg = scene.add.rectangle(x, y, w, h, 0x2a2a4a).setInteractive({ useHandCursor: true });
  const border = scene.add.rectangle(x, y, w, h).setStrokeStyle(2, ACCENT);
  const txt = scene.add.text(x, y, label, {
    fontFamily: 'monospace', fontSize: '18px', color: TEXT_CLR,
  }).setOrigin(0.5);

  bg.on('pointerover',  () => { bg.setFillStyle(ACCENT); });
  bg.on('pointerout',   () => { bg.setFillStyle(0x2a2a4a); });
  bg.on('pointerdown',  () => { bg.setFillStyle(0xaa2233); });
  bg.on('pointerup',    () => { bg.setFillStyle(0x2a2a4a); callback(); });

  return { bg, border, txt };
}

// ─── MenuScene ────────────────────────────────────────────────────────────────

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    window.dispatchEvent(new CustomEvent('robokart-controls', { detail: { visible: false } }));
    const W = GAME_WIDTH, H = GAME_HEIGHT;
    const compactMenu = window.matchMedia?.('(pointer: coarse) and (orientation: landscape)').matches;
    const titleY = compactMenu ? 42 : 52;
    const titleSize = compactMenu ? '60px' : '72px';
    const subtitleY = compactMenu ? 92 : 110;
    const sectionYs = compactMenu
      ? { players: 154, track: 232, laps: 310, bots: 388 }
      : { players: 190, track: 286, laps: 382, bots: 478 };
    const controlsY = compactMenu ? 486 : 558;
    const startY = compactMenu ? H - 30 : H - 58;

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, BG);

    // Decorative speed lines
    for (let i = 0; i < 12; i++) {
      const y = 60 + i * 55;
      this.add.rectangle(W * 0.72, y, W * 0.6, 2, 0xffffff, 0.04);
    }

    // ── Title ─────────────────────────────────────────────────────────────
    this.add.text(W / 2, titleY, 'ROBO  KART', {
      fontFamily: 'Impact, monospace',
      fontSize:   titleSize,
      color:      '#ffffff',
      stroke:     '#e94560',
      strokeThickness: 6,
      shadow:     { offsetX: 4, offsetY: 4, color: '#000', blur: 8, fill: true },
    }).setOrigin(0.5);

    this.add.text(W / 2, subtitleY, 'BEAT THE BOTS', {
      fontFamily: 'monospace', fontSize: compactMenu ? '18px' : '20px', color: '#e94560',
      letterSpacing: 8,
    }).setOrigin(0.5);

    // ── Selection state ───────────────────────────────────────────────────
    this._numPlayers = 3;   // total karts (1 human + N-1 bots)
    this._trackIdx   = 0;
    this._laps       = 3;
    this._botDifficulty = 'medium';

    // ── Panel: players ────────────────────────────────────────────────────
    this._buildSection(W / 2, sectionYs.players, 'PLAYERS  (1 human + bots)', () => {
      const labels = ['2 total', '3 total', '4 total', '5 total'];
      return labels.map((lbl, i) => ({
        lbl,
        value: i + 2,
        getter: () => this._numPlayers,
        setter: v => { this._numPlayers = v; },
      }));
    });

    // ── Panel: track ──────────────────────────────────────────────────────
    this._buildSection(W / 2, sectionYs.track, 'TRACK', () =>
      TRACKS.map((t, i) => ({
        lbl:    `${t.name}\n[${t.difficulty}]`,
        value:  i,
        getter: () => this._trackIdx,
        setter: v => { this._trackIdx = v; },
      })),
      {
        fontSize: compactMenu ? '11px' : '12px',
        fixedWidth: compactMenu ? 128 : 136,
        lineSpacing: 2,
        paddingX: compactMenu ? 4 : 6,
        paddingY: compactMenu ? 4 : 6,
      }
    );

    // ── Panel: laps ───────────────────────────────────────────────────────
    this._buildSection(W / 2, sectionYs.laps, 'LAPS', () => {
      const opts = [1, 2, 3, 5, 7, 10];
      return opts.map(n => ({
        lbl:    `${n}`,
        value:  n,
        getter: () => this._laps,
        setter: v => { this._laps = v; },
      }));
    });

    // ── Panel: bot difficulty ─────────────────────────────────────────────
    this._buildSection(W / 2, sectionYs.bots, 'BOT DIFFICULTY', () =>
      Object.entries(BOT_DIFFICULTIES).map(([value, config]) => ({
        lbl:    config.label,
        value,
        getter: () => this._botDifficulty,
        setter: v => { this._botDifficulty = v; },
      }))
    );

    // ── Controls legend ───────────────────────────────────────────────────
    const leg = [
      '🎮  ARROWS / WASD  →  Drive',
      '🐢  Z  →  Use item slot 1',
      '🐢  X  →  Use item slot 2',
    ];
    leg.forEach((line, i) => {
      this.add.text(W / 2, controlsY + i * (compactMenu ? 22 : 28), line, {
        fontFamily: 'monospace', fontSize: compactMenu ? '13px' : '15px', color: DIM_CLR,
      }).setOrigin(0.5);
    });

    // ── Item legend ───────────────────────────────────────────────────────
    if (!compactMenu) {
      const items = [
        { icon: '🟢', name: 'Green Shell', desc: 'Thrown forward — stuns on hit' },
        { icon: '🍌', name: 'Banana Peel', desc: 'Dropped behind — causes slide' },
        { icon: '🔥', name: 'Speed Boost', desc: '3× speed for 3 seconds' },
      ];
      const legendX = 80;
      items.forEach((it, i) => {
        this.add.text(legendX, 200 + i * 58,
          `${it.icon}  ${it.name}`, {
            fontFamily: 'monospace', fontSize: '16px', color: '#ffdd88',
          }
        );
        this.add.text(legendX, 222 + i * 58, `   ${it.desc}`, {
          fontFamily: 'monospace', fontSize: '13px', color: DIM_CLR,
        });
      });
    }

    // ── Start button ──────────────────────────────────────────────────────
    const startBtn = this.add.text(W / 2, startY, '▶  START RACE', {
      fontFamily: 'Impact, monospace',
      fontSize:   compactMenu ? '28px' : '34px',
      color:      '#ffffff',
      backgroundColor: '#e94560',
      padding:    { x: compactMenu ? 28 : 40, y: compactMenu ? 10 : 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    startBtn.on('pointerover',  () => startBtn.setStyle({ color: '#ffff88' }));
    startBtn.on('pointerout',   () => startBtn.setStyle({ color: '#ffffff' }));
    startBtn.on('pointerup',    () => this._startRace());

    // Pulse animation on start button
    this.tweens.add({
      targets:  startBtn,
      scaleX:   1.04,
      scaleY:   1.04,
      duration: 700,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }

  // ── Option selector builder ───────────────────────────────────────────────

  /**
   * Build a labeled row of selector buttons.
   * @param {number}   cx        Center x
   * @param {number}   cy        Top y of section
   * @param {string}   title
   * @param {function} optsFn    Returns array of {lbl, value, getter, setter}
   */
  _buildSection(cx, cy, title, optsFn, config = {}) {
    this.add.text(cx, cy, title, {
      fontFamily: 'monospace', fontSize: '13px', color: '#e94560',
      letterSpacing: 4,
    }).setOrigin(0.5);

    const opts    = optsFn();
    const btnW    = config.fixedWidth ?? Math.min(140, (580 / opts.length) - 6);
    const gap     = btnW + 8;
    const startX  = cx - ((opts.length - 1) * gap) / 2;
    const fontSize = config.fontSize ?? '14px';
    const paddingX = config.paddingX ?? 10;
    const paddingY = config.paddingY ?? 7;
    const lineSpacing = config.lineSpacing ?? 0;

    opts.forEach((opt, i) => {
      const x   = startX + i * gap;
      const btn = this.add.text(x, cy + 38, opt.lbl, {
        fontFamily: 'monospace',
        fontSize,
        color:      opt.getter() === opt.value ? '#ffdd00' : DIM_CLR,
        backgroundColor: opt.getter() === opt.value ? '#2a1a00' : '#111122',
        align:      'center',
        fixedWidth: btnW,
        lineSpacing,
        padding:    { x: paddingX, y: paddingY },
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      const refresh = () => {
        opts.forEach((o, j) => {
          // Re-render all buttons in this group
          const selected = o.getter() === o.value;
          this._selectorBtns[`${title}_${j}`]
            ?.setStyle({ color: selected ? '#ffdd00' : DIM_CLR,
                         backgroundColor: selected ? '#2a1a00' : '#111122' });
        });
      };

      if (!this._selectorBtns) this._selectorBtns = {};
      this._selectorBtns[`${title}_${i}`] = btn;

      btn.on('pointerup', () => {
        opt.setter(opt.value);
        refresh();
      });
    });
  }

  // ── Launch the race ───────────────────────────────────────────────────────

  _startRace() {
    this.scene.start('RaceScene', {
      numPlayers: this._numPlayers,
      trackIdx:   this._trackIdx,
      laps:       this._laps,
      botDifficulty: this._botDifficulty,
    });
  }
}
