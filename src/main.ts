import Phaser from 'phaser';
import './styles.css';
import { GAME_HEIGHT, GAME_WIDTH } from './game/constants';
import { FightScene } from './scenes/FightScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0d1017',
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [FightScene],
};

const game = new Phaser.Game(config);

function viewportSize(): { width: number; height: number } {
  const visualViewport = window.visualViewport;
  return {
    width: Math.max(1, Math.round(visualViewport?.width ?? window.innerWidth ?? GAME_WIDTH)),
    height: Math.max(1, Math.round(visualViewport?.height ?? window.innerHeight ?? GAME_HEIGHT)),
  };
}

function syncViewportSize(): void {
  const { width, height } = viewportSize();
  document.documentElement.style.setProperty('--app-width', `${width}px`);
  document.documentElement.style.setProperty('--app-height', `${height}px`);
  game.scale.setParentSize(width, height);
}

syncViewportSize();
window.addEventListener('resize', syncViewportSize, { passive: true });
window.visualViewport?.addEventListener('resize', syncViewportSize, { passive: true });
window.addEventListener(
  'orientationchange',
  () => {
    syncViewportSize();
    window.setTimeout(syncViewportSize, 250);
  },
  { passive: true },
);
window.setTimeout(syncViewportSize, 0);
window.setTimeout(syncViewportSize, 500);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', window.location.href)).catch((error: unknown) => {
      console.warn('Offline play registration failed.', error);
    });
  });
}
