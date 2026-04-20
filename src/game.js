import { GAME_WIDTH, GAME_HEIGHT } from './constants.js';
import { MenuScene }    from './scenes/MenuScene.js';
import { RaceScene }    from './scenes/RaceScene.js';
import { ResultsScene } from './scenes/ResultsScene.js';

const config = {
  type:            Phaser.AUTO,
  width:           GAME_WIDTH,
  height:          GAME_HEIGHT,
  backgroundColor: '#0d0d1a',
  parent:          'game-container',
  physics: {
    default: 'arcade',
    arcade:  { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [MenuScene, RaceScene, ResultsScene],
  scale: {
    mode:            Phaser.Scale.FIT,
    autoCenter:      Phaser.Scale.CENTER_BOTH,
    min: { width: 640,       height: 360 },
    max: { width: GAME_WIDTH, height: GAME_HEIGHT },
  },
};

window.__game = new Phaser.Game(config);
