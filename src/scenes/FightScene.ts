import Phaser from 'phaser';
import { SimpleAiController } from '../game/ai';
import {
  ENEMY_COUNT_OPTIONS,
  ENEMY_STRENGTH_OPTIONS,
  SHOP_PRODUCTS,
  emptyUpgrades,
  enemyDamageMultiplier,
  enemyHealthMultiplier,
  productLevel,
  productPrice,
  victoryReward,
  type CampaignSettings,
  type PlayerUpgrades,
  type ShopProduct,
} from '../game/campaign';
import { BattleEngine } from '../game/combat';
import { ATTACKS, FIGHTER, GAME_HEIGHT, GAME_WIDTH, PARRY, ROUND_FLOW, ROUND_TIME_MS, STAGE, THROW } from '../game/constants';
import { activeActionBox, fighterHurtbox, overlapPoint, throwHitbox, type CombatBox } from '../game/hitboxes';
import { ComboInputBuffer } from '../game/inputBuffer';
import type { BattleSnapshot, CombatEvent, Facing, FighterId, FighterIntent, FighterModel } from '../game/types';

type RoundMode = 'select' | 'tutorial' | 'fight' | 'shop' | 'over';
type CharacterId = 'male' | 'female';
type TouchButtonId = 'left' | 'right' | 'light' | 'heavy' | 'block' | 'special' | 'throw';
type DemoPose = 'heavyActive' | 'throwVictim' | 'blocking' | 'blockstun' | 'parry' | 'parryFlash';
type SfxKey = 'hit' | 'block' | 'counter' | 'throw' | 'parry';

interface TouchButton {
  id: TouchButtonId;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  down: boolean;
  justPressed: boolean;
}

interface KeyMap {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  light: Phaser.Input.Keyboard.Key;
  heavy: Phaser.Input.Keyboard.Key;
  block: Phaser.Input.Keyboard.Key;
  special: Phaser.Input.Keyboard.Key;
  restart: Phaser.Input.Keyboard.Key;
  skip: Phaser.Input.Keyboard.Key;
  chooseMale: Phaser.Input.Keyboard.Key;
  chooseFemale: Phaser.Input.Keyboard.Key;
  debugToggle: Phaser.Input.Keyboard.Key;
}

interface FighterPose {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

interface WorldViewport {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface ProductUi {
  product: ShopProduct;
  card: Phaser.GameObjects.Rectangle;
  status: Phaser.GameObjects.Text;
}

const TUTORIAL_STEPS = [
  '教學 1/4：靠近對手並用輕攻擊或重攻擊命中。',
  '教學 2/4：按住防禦擋住攻擊，或按特殊鍵招架。',
  '教學 3/4：靠近後按特殊 + 重攻擊投技；手機可按投技鍵。',
  '教學 4/4：等對手出招前搖時命中，打出 COUNTER。',
];

interface CharacterSheetSpec {
  keys: [string, string, string];
  files: [string, string, string];
  frameWidth: number;
  frameHeight: number;
}

const CHARACTER_SHEETS: Record<CharacterId, CharacterSheetSpec> = {
  male: {
    keys: ['character-male-key', 'character-male-between-a', 'character-male-between-b'],
    files: ['male-actions-v3-key.png', 'male-actions-v3-inbetween-a.png', 'male-actions-v3-inbetween-b.png'],
    frameWidth: 192,
    frameHeight: 256,
  },
  female: {
    keys: ['character-female-key', 'character-female-between-a', 'character-female-between-b'],
    files: ['female-actions-v3-key.png', 'female-actions-v3-inbetween-a.png', 'female-actions-v3-inbetween-b.png'],
    frameWidth: 224,
    frameHeight: 256,
  },
};

const BASE_FRAME_DISPLAY_HEIGHT = 310;
const FEMALE_FLOOR_LIFT = 5;
const TOUCH_BUTTON_ALPHA = 0.58;
const TOUCH_BUTTON_ACTIVE_ALPHA = 0.84;
const TOUCH_BUTTON_FADED_ALPHA = 0.3;

const FEMALE_FRAMES = {
  idleBreath: 21,
  walkPass: 18,
  walkRecover: 19,
  kickChamber: 20,
  kickPrepV2: 28,
  kickProcessV2: 30,
  kickActiveV2: 29,
  kickRetractV2: 31,
  jabRecover: 21,
  forwardStep: 22,
  jabExtend: 23,
  guardSettle: 24,
  hitRecoil: 25,
  throwReach: 26,
  throwReachV2: 32,
  throwPullV2: 33,
  throwVictimCaught: 34,
  throwVictimPulled: 35,
  throwVictimFalling: 36,
  throwVictimLanding: 37,
  throwVictimGetUp: 38,
  throwVictimRecover: 39,
  getUp: 27,
} as const;

const DEMO_POSES = new Set<DemoPose>(['heavyActive', 'throwVictim', 'blocking', 'blockstun', 'parry', 'parryFlash']);
const SFX_KEYS = new Set<string>(['hit', 'block', 'counter', 'throw', 'parry']);
const SUCCESS_FLASH_MS = 260;

const MALE_FRAMES = {
  throwVictimCaught: 16,
  throwVictimPulled: 17,
  throwVictimFalling: 18,
  throwVictimLanding: 19,
  throwVictimGrounded: 20,
  throwVictimGetUp: 21,
  throwVictimGuardLow: 22,
  throwVictimRecover: 23,
  idleBreath: 24,
  walkStart: 25,
  walkPass: 26,
  walkRecover: 27,
  jabPrepare: 28,
  jabExtend: 29,
  jabRecover: 30,
  kickChamber: 31,
  kickExtend: 32,
  throwReach: 33,
  throwPull: 34,
  throwRecover: 35,
  hitRecoil: 36,
  hitDeep: 37,
  groundedRecover: 38,
  guardSettle: 39,
  guardBrace: 40,
  parryReach: 41,
} as const;

export class FightScene extends Phaser.Scene {
  private engine = new BattleEngine();
  private ai = new SimpleAiController();
  private inputBuffer = new ComboInputBuffer();
  private mode: RoundMode = 'select';
  private selectedCharacter: CharacterId = 'male';
  private tutorialStep = 0;
  private tutorialAiTimer = 0;
  private roundOverTimer = 0;
  private eventTextTimer = 0;
  private playerParryFlashTimer = 0;
  private aiParryFlashTimer = 0;
  private sceneTimeMs = 0;
  private backgroundTravel = 0;
  private sparkTimer = 0;
  private lastPlayerX = 315;
  private lastAiX = 645;
  private isTouchUiVisible = false;
  private showDebugBoxes = false;
  private useIdleAi = false;
  private demoPose?: DemoPose;
  private unavailableSfx = new Set<SfxKey>();
  private arenaBackdrop!: Phaser.GameObjects.Rectangle;
  private arenaWidthRects: Phaser.GameObjects.Rectangle[] = [];
  private arenaTiles: Phaser.GameObjects.TileSprite[] = [];
  private campaignSettings: CampaignSettings = { enemyCount: 3, enemyStrength: 1 };
  private currentEnemy = 1;
  private coins = 0;
  private upgrades: PlayerUpgrades = emptyUpgrades();

  private keys!: KeyMap;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private aiSprite!: Phaser.GameObjects.Sprite;
  private playerAfterimage!: Phaser.GameObjects.Sprite;
  private aiAfterimage!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private aiShadow!: Phaser.GameObjects.Ellipse;
  private playerBar!: Phaser.GameObjects.Rectangle;
  private aiBar!: Phaser.GameObjects.Rectangle;
  private timerText!: Phaser.GameObjects.Text;
  private eventText!: Phaser.GameObjects.Text;
  private modeText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private debugToggleRect!: Phaser.GameObjects.Rectangle;
  private debugToggleText!: Phaser.GameObjects.Text;
  private roundActionContainer!: Phaser.GameObjects.Container;
  private orientationOverlay!: Phaser.GameObjects.Container;
  private orientationBackdrop!: Phaser.GameObjects.Rectangle;
  private selectionOverlay!: Phaser.GameObjects.Container;
  private selectionBackdrop!: Phaser.GameObjects.Rectangle;
  private enemyCountText!: Phaser.GameObjects.Text;
  private enemyStrengthText!: Phaser.GameObjects.Text;
  private shopOverlay!: Phaser.GameObjects.Container;
  private shopBackdrop!: Phaser.GameObjects.Rectangle;
  private shopCoinsText!: Phaser.GameObjects.Text;
  private shopProgressText!: Phaser.GameObjects.Text;
  private productUi: ProductUi[] = [];
  private attackArc!: Phaser.GameObjects.Rectangle;
  private throwRangeHint!: Phaser.GameObjects.Rectangle;
  private playerHurtboxViz!: Phaser.GameObjects.Rectangle;
  private aiHurtboxViz!: Phaser.GameObjects.Rectangle;
  private sparkCore!: Phaser.GameObjects.Ellipse;
  private sparkRing!: Phaser.GameObjects.Ellipse;
  private touchButtons = new Map<TouchButtonId, TouchButton>();

  preload(): void {
    (Object.keys(CHARACTER_SHEETS) as CharacterId[]).forEach((character) => {
      const sheet = CHARACTER_SHEETS[character];
      sheet.keys.forEach((key, phase) => {
        this.load.spritesheet(key, `assets/characters/sheets/${sheet.files[phase]}`, {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        });
      });
    });
    this.load.audio('hit', ['assets/audio/hit.wav', 'assets/audio/hit.ogg']);
    this.load.audio('block', ['assets/audio/block.wav', 'assets/audio/block.ogg']);
    this.load.audio('counter', ['assets/audio/counter.wav', 'assets/audio/counter.ogg']);
    this.load.audio('throw', ['assets/audio/throw.wav', 'assets/audio/throw.ogg']);
    this.load.audio('parry', ['assets/audio/parry.wav', 'assets/audio/parry.ogg']);
  }

  create(): void {
    this.createTextures();
    this.createArena();
    this.createFighters();
    this.createUi();
    this.createSelectionOverlay();
    this.createShopOverlay();
    this.createTouchControls();
    this.createOrientationOverlay();
    this.installResponsiveLayout();
    this.createKeys();
    this.setupCanvasFocus();
    this.showCharacterSelect();
    this.startFromUrlIfRequested();
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 34);
    this.sceneTimeMs += dt;
    this.updateArena(dt);
    this.updateOrientationOverlay();

    if (Phaser.Input.Keyboard.JustDown(this.keys.debugToggle)) {
      this.toggleDebugBoxes();
    }

    if (this.mode === 'select') {
      this.handleSelectionInput();
      this.clearTouchPresses();
      return;
    }

    if (this.mode === 'shop') {
      this.render(this.engine.snapshot());
      this.clearTouchPresses();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) {
      this.startFight();
      return;
    }

    if (this.mode === 'over') {
      this.roundOverTimer -= dt;
      if (this.roundOverTimer <= 0) {
        this.hintText.setText('按 R 用同角色重試，或 Enter 回到選角');
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.skip)) {
        this.showCharacterSelect();
      }
      this.render(this.engine.snapshot());
      this.clearTouchPresses();
      return;
    }

    if (this.mode === 'tutorial' && Phaser.Input.Keyboard.JustDown(this.keys.skip)) {
      this.startFight();
      return;
    }

    if (this.demoPose) {
      this.applyDemoPoseState();
      this.render(this.engine.snapshot());
      this.clearTouchPresses();
      return;
    }

    const playerIntent = this.readPlayerIntent(dt);
    const aiIntent = this.mode === 'tutorial'
      ? this.tutorialIntent(dt)
      : this.useIdleAi
        ? { left: false, right: false, block: false }
        : this.ai.update(this.engine.snapshot(), dt);
    const snapshot = this.engine.update(dt, playerIntent, aiIntent);

    this.handleEvents(snapshot.events);
    if (this.mode === 'tutorial') this.advanceTutorial(snapshot);
    if (snapshot.roundOver) this.finishRound(snapshot);

    this.render(snapshot);
    this.clearTouchPresses();
  }

  private createKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable.');

    this.keys = {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      light: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      heavy: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      block: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      special: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I),
      restart: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      skip: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      chooseMale: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      chooseFemale: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      debugToggle: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H),
    };
  }

  private setupCanvasFocus(): void {
    const canvas = this.sys.game.canvas;
    canvas.setAttribute('tabindex', '0');
    canvas.style.outline = 'none';

    const focusCanvas = () => {
      canvas.focus({ preventScroll: true });
    };

    this.input.on('pointerdown', focusCanvas);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', focusCanvas);
    });
    this.time.delayedCall(0, focusCanvas);
  }

  private createTextures(): void {
    const far = this.make.graphics({ x: 0, y: 0 });
    far.fillStyle(0x111c31, 1).fillRect(0, 100, 320, 80);
    const farBuildings = [
      [10, 44, 54, 136], [72, 76, 42, 104], [122, 24, 62, 156],
      [194, 62, 48, 118], [252, 36, 58, 144],
    ];
    for (const [x, y, width, height] of farBuildings) {
      far.fillStyle(0x17243a, 1).fillRect(x, y, width, height);
      far.fillStyle(0x38bdf8, 0.22);
      for (let windowY = y + 16; windowY < y + height - 10; windowY += 24) {
        far.fillRect(x + 10, windowY, 5, 7).fillRect(x + width - 16, windowY, 5, 7);
      }
    }
    far.generateTexture('arena-far-city', 320, 180);
    far.destroy();

    const rail = this.make.graphics({ x: 0, y: 0 });
    rail.fillStyle(0x0b1220, 0.94).fillRect(0, 74, 192, 16);
    rail.fillStyle(0x334155, 0.85).fillRect(0, 48, 192, 5);
    for (let x = 0; x < 192; x += 48) {
      rail.fillStyle(0x475569, 0.9).fillRect(x, 28, 6, 62);
      rail.fillStyle(0x22d3ee, 0.72).fillRect(x + 12, 38, 18, 5);
      rail.fillStyle(0xf43f5e, 0.6).fillRect(x + 34, 58, 8, 4);
    }
    rail.generateTexture('arena-neon-rail', 192, 90);
    rail.destroy();

    const ground = this.make.graphics({ x: 0, y: 0 });
    ground.fillStyle(0x252c39, 1).fillRect(0, 0, 128, 120);
    ground.fillStyle(0x3b4555, 1).fillRect(0, 0, 128, 8);
    ground.lineStyle(2, 0x111827, 0.7);
    ground.lineBetween(0, 42, 128, 42).lineBetween(0, 82, 128, 82);
    ground.lineBetween(32, 0, 12, 120).lineBetween(96, 0, 116, 120);
    ground.generateTexture('arena-ground', 128, 120);
    ground.destroy();
  }

  private createArena(): void {
    const worldFillWidth = GAME_WIDTH * 3;
    this.arenaBackdrop = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, worldFillWidth, GAME_HEIGHT * 3, 0x0d1017);
    this.arenaWidthRects = [
      this.add.rectangle(GAME_WIDTH / 2, 262, worldFillWidth, 300, 0x151b25),
      this.add.rectangle(GAME_WIDTH / 2, 146, worldFillWidth, 90, 0x202a38).setAlpha(0.65),
      this.add.rectangle(GAME_WIDTH / 2, STAGE.floorY - 8, worldFillWidth, 10, 0xcbd5e1),
    ];
    this.arenaTiles = [
      this.add.tileSprite(GAME_WIDTH / 2, 136, worldFillWidth, 180, 'arena-far-city').setOrigin(0.5, 0),
      this.add.tileSprite(GAME_WIDTH / 2, 306, worldFillWidth, 90, 'arena-neon-rail').setOrigin(0.5, 0),
      this.add.tileSprite(GAME_WIDTH / 2, STAGE.floorY - 2, worldFillWidth, 120, 'arena-ground').setOrigin(0.5, 0),
    ];
  }

  private updateArena(dtMs: number): void {
    const fighterTravel = this.mode === 'fight' || this.mode === 'tutorial'
      ? this.engine.player.x - this.lastPlayerX
      : 0;
    this.backgroundTravel += fighterTravel + dtMs * 0.005;
    if (this.arenaTiles[0]) this.arenaTiles[0].tilePositionX = Math.floor(this.backgroundTravel * 0.16);
    if (this.arenaTiles[1]) this.arenaTiles[1].tilePositionX = Math.floor(this.backgroundTravel * 0.38);
    if (this.arenaTiles[2]) this.arenaTiles[2].tilePositionX = Math.floor(this.backgroundTravel * 0.72);
  }

  private createFighters(): void {
    this.playerShadow = this.add.ellipse(0, STAGE.floorY + 4, 82, 18, 0x05070c, 0.42);
    this.aiShadow = this.add.ellipse(0, STAGE.floorY + 4, 82, 18, 0x05070c, 0.42);
    this.playerAfterimage = this.add
      .sprite(0, STAGE.floorY, characterSheetKey('male'), 0)
      .setOrigin(0.5, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.aiAfterimage = this.add
      .sprite(0, STAGE.floorY, characterSheetKey('female'), 0)
      .setOrigin(0.5, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.playerSprite = this.add.sprite(0, STAGE.floorY, characterSheetKey('male'), 0).setOrigin(0.5, 1);
    this.aiSprite = this.add.sprite(0, STAGE.floorY, characterSheetKey('female'), 0).setOrigin(0.5, 1);
    this.scaleFighterSprite(this.playerAfterimage);
    this.scaleFighterSprite(this.aiAfterimage);
    this.scaleFighterSprite(this.playerSprite);
    this.scaleFighterSprite(this.aiSprite);
    this.attackArc = this.add.rectangle(0, STAGE.floorY - 62, 78, 18, 0xfacc15, 0.55).setVisible(false);
    this.throwRangeHint = this.add
      .rectangle(0, STAGE.floorY - 62, 70, 26, 0xa855f7, 0.12)
      .setStrokeStyle(2, 0xa855f7, 0.72)
      .setVisible(false);
    this.playerHurtboxViz = this.add
      .rectangle(0, 0, 10, 10, 0x22c55e, 0.08)
      .setStrokeStyle(2, 0x22c55e, 0.45)
      .setVisible(false);
    this.aiHurtboxViz = this.add
      .rectangle(0, 0, 10, 10, 0xef4444, 0.08)
      .setStrokeStyle(2, 0xef4444, 0.45)
      .setVisible(false);
    this.sparkRing = this.add.ellipse(0, 0, 54, 28, 0xffffff, 0.2).setStrokeStyle(3, 0xffffff, 0.95).setVisible(false);
    this.sparkCore = this.add.ellipse(0, 0, 18, 18, 0xfacc15, 0.92).setVisible(false);
  }

  private createUi(): void {
    this.add.rectangle(232, 38, 332, 24, 0x111827);
    this.add.rectangle(728, 38, 332, 24, 0x111827);
    this.playerBar = this.add.rectangle(66, 38, 332, 24, 0x22c55e).setOrigin(0, 0.5);
    this.aiBar = this.add.rectangle(894, 38, 332, 24, 0xef4444).setOrigin(1, 0.5);
    this.add.text(64, 62, 'PLAYER', textStyle(16, '#dbeafe')).setOrigin(0, 0);
    this.add.text(896, 62, 'RIVAL AI', textStyle(16, '#fee2e2')).setOrigin(1, 0);

    this.timerText = this.add.text(GAME_WIDTH / 2, 36, '45', textStyle(38, '#f8fafc')).setOrigin(0.5);
    this.eventText = this.add.text(GAME_WIDTH / 2, 118, '', textStyle(40, '#facc15')).setOrigin(0.5);
    this.modeText = this.add.text(GAME_WIDTH / 2, 468, '', textStyle(20, '#f8fafc')).setOrigin(0.5);
    this.hintText = this.add
      .text(GAME_WIDTH / 2, 502, '', textStyle(15, '#cbd5e1'))
      .setOrigin(0.5)
      .setAlign('center');

    this.debugToggleRect = this.add
      .rectangle(GAME_WIDTH / 2, 82, 112, 28, 0x164e63, 0.78)
      .setStrokeStyle(2, 0x67e8f9, 0.75)
      .setInteractive({ useHandCursor: true })
      .setDepth(10)
      .setVisible(false);
    this.debugToggleText = this.add
      .text(GAME_WIDTH / 2, 82, '', textStyle(14, '#cffafe'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(11)
      .setVisible(false);
    this.debugToggleRect.on('pointerdown', () => this.toggleDebugBoxes());
    this.debugToggleText.on('pointerdown', () => this.toggleDebugBoxes());
    this.updateDebugToggleUi();
    this.createRoundOverActions();
  }

  private createRoundOverActions(): void {
    const restartRect = this.add
      .rectangle(GAME_WIDTH / 2 - 76, 216, 124, 42, 0x0f766e, 0.9)
      .setStrokeStyle(2, 0x5eead4, 0.85)
      .setInteractive({ useHandCursor: true });
    const restartText = this.add
      .text(GAME_WIDTH / 2 - 76, 216, '再戰', textStyle(19, '#ecfeff'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const selectRect = this.add
      .rectangle(GAME_WIDTH / 2 + 76, 216, 124, 42, 0x334155, 0.9)
      .setStrokeStyle(2, 0x94a3b8, 0.82)
      .setInteractive({ useHandCursor: true });
    const selectText = this.add
      .text(GAME_WIDTH / 2 + 76, 216, '選角', textStyle(19, '#f8fafc'))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const restart = () => this.startFight();
    const select = () => this.showCharacterSelect();

    restartRect.on('pointerdown', restart);
    restartText.on('pointerdown', restart);
    selectRect.on('pointerdown', select);
    selectText.on('pointerdown', select);

    this.roundActionContainer = this.add
      .container(0, 0, [restartRect, restartText, selectRect, selectText])
      .setDepth(31)
      .setVisible(false);
  }

  private createSelectionOverlay(): void {
    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d1017, 0.92);
    this.selectionBackdrop = bg;
    const title = this.add
      .text(GAME_WIDTH / 2, 42, '選擇你的角色', textStyle(31, '#f8fafc'))
      .setOrigin(0.5);
    const subtitle = this.add
      .text(GAME_WIDTH / 2, 77, '先設定挑戰，再按 1 / 2 或點選角色', textStyle(15, '#cbd5e1'))
      .setOrigin(0.5);
    const countControls = this.createSetupStepper(330, 120, '敵人數量', () => this.cycleEnemyCount(-1), () => this.cycleEnemyCount(1), (text) => { this.enemyCountText = text; });
    const strengthControls = this.createSetupStepper(630, 120, '敵人強度', () => this.cycleEnemyStrength(-1), () => this.cycleEnemyStrength(1), (text) => { this.enemyStrengthText = text; });
    const maleCard = this.createCharacterCard(310, 'male', '1', '平頭戰術兵', '穩定、防守讀招');
    const femaleCard = this.createCharacterCard(650, 'female', '2', '女格鬥家', '靈活、近身壓迫');

    this.selectionOverlay = this.add
      .container(0, 0, [bg, title, subtitle, ...countControls, ...strengthControls, ...maleCard, ...femaleCard])
      .setDepth(40)
      .setVisible(false);
    this.updateSetupLabels();
  }

  private createSetupStepper(
    x: number,
    y: number,
    label: string,
    decrease: () => void,
    increase: () => void,
    captureValue: (text: Phaser.GameObjects.Text) => void,
  ): Phaser.GameObjects.GameObject[] {
    const labelText = this.add.text(x - 92, y, label, textStyle(15, '#cbd5e1')).setOrigin(0, 0.5);
    const minus = this.add.rectangle(x + 24, y, 32, 28, 0x334155, 0.95).setStrokeStyle(1, 0x94a3b8).setInteractive({ useHandCursor: true });
    const minusText = this.add.text(x + 24, y - 1, '−', textStyle(19, '#ffffff')).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const value = this.add.text(x + 72, y, '', textStyle(16, '#67e8f9')).setOrigin(0.5);
    const plus = this.add.rectangle(x + 120, y, 32, 28, 0x164e63, 0.95).setStrokeStyle(1, 0x67e8f9).setInteractive({ useHandCursor: true });
    const plusText = this.add.text(x + 120, y - 1, '+', textStyle(18, '#ffffff')).setOrigin(0.5).setInteractive({ useHandCursor: true });
    minus.on('pointerdown', decrease);
    minusText.on('pointerdown', decrease);
    plus.on('pointerdown', increase);
    plusText.on('pointerdown', increase);
    captureValue(value);
    return [labelText, minus, minusText, value, plus, plusText];
  }

  private cycleEnemyCount(direction: number): void {
    const index = ENEMY_COUNT_OPTIONS.indexOf(this.campaignSettings.enemyCount);
    this.campaignSettings.enemyCount = ENEMY_COUNT_OPTIONS[Phaser.Math.Wrap(index + direction, 0, ENEMY_COUNT_OPTIONS.length)];
    this.updateSetupLabels();
  }

  private cycleEnemyStrength(direction: number): void {
    const index = ENEMY_STRENGTH_OPTIONS.indexOf(this.campaignSettings.enemyStrength);
    this.campaignSettings.enemyStrength = ENEMY_STRENGTH_OPTIONS[Phaser.Math.Wrap(index + direction, 0, ENEMY_STRENGTH_OPTIONS.length)];
    this.updateSetupLabels();
  }

  private updateSetupLabels(): void {
    this.enemyCountText?.setText(`${this.campaignSettings.enemyCount} 名`);
    this.enemyStrengthText?.setText(`${Math.round(this.campaignSettings.enemyStrength * 100)}%`);
  }

  private createCharacterCard(
    x: number,
    character: CharacterId,
    hotkey: string,
    name: string,
    role: string,
  ): Phaser.GameObjects.GameObject[] {
    const card = this.add
      .rectangle(x, 330, 276, 340, 0x172033, 0.96)
      .setStrokeStyle(2, 0x93c5fd, 0.55)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(x, 178, `${hotkey}. ${name}`, textStyle(21, '#ffffff')).setOrigin(0.5);
    const portraitY = 452;
    const portrait = this.add.sprite(x, portraitY, characterSheetKey(character), 0).setOrigin(0.5, 1);
    portrait.displayHeight = 250;
    portrait.scaleX = portrait.scaleY;
    const desc = this.add.text(x, 482, role, textStyle(16, '#cbd5e1')).setOrigin(0.5);
    const start = () => {
      this.selectedCharacter = character;
      this.beginCampaign();
      this.startTutorial();
    };
    card.on('pointerdown', start);
    portrait.setInteractive({ useHandCursor: true }).on('pointerdown', start);
    return [card, portrait, label, desc];
  }

  private createShopOverlay(): void {
    this.shopBackdrop = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x07111f, 0.96);
    const title = this.add.text(GAME_WIDTH / 2, 58, '補給商店', textStyle(34, '#67e8f9')).setOrigin(0.5);
    this.shopProgressText = this.add.text(GAME_WIDTH / 2, 100, '', textStyle(17, '#cbd5e1')).setOrigin(0.5);
    this.shopCoinsText = this.add.text(GAME_WIDTH / 2, 132, '', textStyle(21, '#facc15')).setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [this.shopBackdrop, title, this.shopProgressText, this.shopCoinsText];

    SHOP_PRODUCTS.forEach((product, index) => {
      const x = 190 + index * 290;
      const card = this.add.rectangle(x, 300, 250, 218, 0x172033, 0.98).setStrokeStyle(2, 0x38bdf8, 0.55).setInteractive({ useHandCursor: true });
      const name = this.add.text(x, 235, product.name, textStyle(21, '#ffffff')).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const desc = this.add.text(x, 278, product.description, textStyle(16, '#cbd5e1')).setOrigin(0.5);
      const status = this.add.text(x, 340, '', textStyle(15, '#facc15')).setOrigin(0.5).setAlign('center').setInteractive({ useHandCursor: true });
      const buy = () => this.buyProduct(product);
      card.on('pointerdown', buy);
      name.on('pointerdown', buy);
      status.on('pointerdown', buy);
      this.productUi.push({ product, card, status });
      children.push(card, name, desc, status);
    });

    const continueButton = this.add.rectangle(GAME_WIDTH / 2, 462, 220, 48, 0x0f766e, 0.95).setStrokeStyle(2, 0x5eead4).setInteractive({ useHandCursor: true });
    const continueText = this.add.text(GAME_WIDTH / 2, 462, '迎戰下一名敵人', textStyle(19, '#ecfeff')).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const continueFight = () => {
      this.currentEnemy += 1;
      this.shopOverlay.setVisible(false);
      this.startFight();
    };
    continueButton.on('pointerdown', continueFight);
    continueText.on('pointerdown', continueFight);
    children.push(continueButton, continueText);
    this.shopOverlay = this.add.container(0, 0, children).setDepth(45).setVisible(false);
  }

  private beginCampaign(): void {
    this.currentEnemy = 1;
    this.coins = 0;
    this.upgrades = emptyUpgrades();
  }

  private buyProduct(product: ShopProduct): void {
    const level = productLevel(product, this.upgrades);
    const price = productPrice(product, level);
    if (level >= product.maxLevel || this.coins < price) return;
    this.coins -= price;
    this.upgrades[product.stat] += product.amount;
    this.updateShopUi();
    this.playSfx('parry', 0.38);
  }

  private updateShopUi(): void {
    this.shopProgressText.setText(`已擊敗 ${this.currentEnemy} / ${this.campaignSettings.enemyCount} · 下一戰敵人更強`);
    this.shopCoinsText.setText(`戰利幣 ${this.coins}`);
    for (const ui of this.productUi) {
      const level = productLevel(ui.product, this.upgrades);
      const maxed = level >= ui.product.maxLevel;
      const price = productPrice(ui.product, level);
      ui.status.setText(maxed ? `LV.${level} · 已滿級` : `LV.${level} → ${level + 1}\n購買 ${price} 幣`);
      ui.card.setStrokeStyle(2, maxed ? 0x64748b : this.coins >= price ? 0x67e8f9 : 0x475569, maxed ? 0.4 : 0.75);
    }
  }

  private openShop(): void {
    this.mode = 'shop';
    this.setRoundOverActionsVisible(false);
    this.setDebugToggleVisible(false);
    this.setTouchControlsVisible(false);
    this.shopOverlay.setVisible(true);
    this.updateShopUi();
  }

  private createTouchControls(): void {
    const specs: Array<[TouchButtonId, number, number, string, number, number]> = [
      ['left', 70, 422, '←', 72, 58],
      ['right', 166, 422, '→', 72, 58],
      ['light', 704, 416, '輕', 60, 56],
      ['heavy', 804, 416, '重', 60, 56],
      ['block', 704, 490, '防', 60, 56],
      ['special', 804, 490, '特', 60, 56],
      ['throw', 892, 454, '投', 62, 72],
    ];

    for (const [id, x, y, label, width, height] of specs) {
      const rect = this.add
        .rectangle(x, y, width, height, id === 'throw' ? 0xf97316 : 0x1f2937, TOUCH_BUTTON_ALPHA)
        .setStrokeStyle(2, 0xf8fafc, 0.6)
        .setInteractive({ useHandCursor: true });
      const text = this.add.text(x, y, label, textStyle(22, '#ffffff')).setOrigin(0.5);
      const button: TouchButton = { id, rect, label: text, down: false, justPressed: false };
      this.touchButtons.set(id, button);

      rect.on('pointerdown', () => {
        button.down = true;
        button.justPressed = true;
        rect.setFillStyle(id === 'throw' ? 0xfb923c : 0x334155, TOUCH_BUTTON_ACTIVE_ALPHA);
      });
      rect.on('pointerup', () => this.releaseTouchButton(button));
      rect.on('pointerout', () => this.releaseTouchButton(button));
      rect.on('pointercancel', () => this.releaseTouchButton(button));
    }

    this.layoutTouchControls();
    this.setTouchControlsVisible(this.sys.game.device.input.touch);
  }

  private createOrientationOverlay(): void {
    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070c, 0.9);
    this.orientationBackdrop = bg;
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '請旋轉成橫向遊玩', textStyle(30, '#ffffff'))
      .setOrigin(0.5);
    this.orientationOverlay = this.add.container(0, 0, [bg, text]).setDepth(50).setVisible(false);
  }

  private installResponsiveLayout(): void {
    this.applyResponsiveLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyResponsiveLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyResponsiveLayout, this);
    });
  }

  private applyResponsiveLayout(): void {
    const width = Math.max(1, this.scale.width || GAME_WIDTH);
    const height = Math.max(1, this.scale.height || GAME_HEIGHT);
    const zoom = Math.max(0.1, Math.min(width / GAME_WIDTH, height / GAME_HEIGHT));
    const visibleWidth = width / zoom;
    const visibleHeight = height / zoom;
    const left = (GAME_WIDTH - visibleWidth) / 2;
    const top = (GAME_HEIGHT - visibleHeight) / 2;
    const bounds: WorldViewport = {
      left,
      right: left + visibleWidth,
      top,
      bottom: top + visibleHeight,
      width: visibleWidth,
      height: visibleHeight,
      centerX: left + visibleWidth / 2,
      centerY: top + visibleHeight / 2,
    };

    this.cameras.main
      .setViewport(0, 0, width, height)
      .setZoom(zoom)
      .setScroll(bounds.left, bounds.top)
      .setBackgroundColor(0x0d1017);

    this.resizeFullscreenRect(this.arenaBackdrop, bounds, 0);
    for (const rect of this.arenaWidthRects) {
      this.resizeWorldWidthRect(rect, bounds, 8);
    }
    for (const tile of this.arenaTiles) {
      tile.setPosition(bounds.centerX, tile.y).setSize(bounds.width + 16, tile.height).setDisplaySize(bounds.width + 16, tile.height);
    }
    this.resizeFullscreenRect(this.selectionBackdrop, bounds, 0);
    this.resizeFullscreenRect(this.shopBackdrop, bounds, 0);
    this.resizeFullscreenRect(this.orientationBackdrop, bounds, 0);
    this.layoutTouchControls(bounds);
    this.updateOrientationOverlay();
  }

  private resizeFullscreenRect(rect: Phaser.GameObjects.Rectangle | undefined, bounds: WorldViewport, padding: number): void {
    this.resizeRect(rect, bounds.centerX, bounds.centerY, bounds.width + padding * 2, bounds.height + padding * 2);
  }

  private resizeWorldWidthRect(rect: Phaser.GameObjects.Rectangle, bounds: WorldViewport, padding: number): void {
    this.resizeRect(rect, bounds.centerX, rect.y, bounds.width + padding * 2, rect.height);
  }

  private resizeRect(
    rect: Phaser.GameObjects.Rectangle | undefined,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    rect?.setPosition(x, y).setSize(width, height).setDisplaySize(width, height);
  }

  private layoutTouchControls(bounds = this.visibleWorldBounds()): void {
    if (this.touchButtons.size === 0) return;

    const moveY = Math.min(422, bounds.bottom - 118);
    const actionTopY = Math.min(416, bounds.bottom - 124);
    const actionBottomY = Math.min(490, bounds.bottom - 50);
    const actionLeftX = bounds.right - 256;
    const actionRightX = bounds.right - 156;

    this.placeTouchButton('left', bounds.left + 70, moveY);
    this.placeTouchButton('right', bounds.left + 166, moveY);
    this.placeTouchButton('light', actionLeftX, actionTopY);
    this.placeTouchButton('heavy', actionRightX, actionTopY);
    this.placeTouchButton('block', actionLeftX, actionBottomY);
    this.placeTouchButton('special', actionRightX, actionBottomY);
    this.placeTouchButton('throw', bounds.right - 68, (actionTopY + actionBottomY) / 2);
  }

  private placeTouchButton(id: TouchButtonId, x: number, y: number): void {
    const button = this.touchButtons.get(id);
    if (!button) return;
    button.rect.setPosition(x, y);
    button.label.setPosition(x, y);
  }

  private visibleWorldBounds(): WorldViewport {
    const camera = this.cameras.main;
    const width = camera.width / camera.zoom;
    const height = camera.height / camera.zoom;
    return {
      left: camera.scrollX,
      right: camera.scrollX + width,
      top: camera.scrollY,
      bottom: camera.scrollY + height,
      width,
      height,
      centerX: camera.scrollX + width / 2,
      centerY: camera.scrollY + height / 2,
    };
  }

  private startTutorial(): void {
    this.demoPose = undefined;
    this.engine.configure({
      playerMaxHealth: FIGHTER.maxHealth,
      aiMaxHealth: FIGHTER.maxHealth,
      playerLightMultiplier: 1,
      playerHeavyMultiplier: 1,
      aiDamageMultiplier: 1,
    });
    this.engine.reset();
    this.ai.reset();
    this.inputBuffer.reset();
    this.resetSuccessFlashTimers();
    this.assignCharacterTextures();
    this.setRoundOverActionsVisible(false);
    this.mode = 'tutorial';
    this.selectionOverlay.setVisible(false);
    this.setDebugToggleVisible(true);
    this.tutorialStep = 0;
    this.tutorialAiTimer = 0;
    this.modeText.setVisible(true);
    this.positionModeTextForPlay();
    this.modeText.setText(TUTORIAL_STEPS[0]);
    this.hintText.setText('鍵盤：←/→ 或 A/D 移動，J 輕，K 重，L 防，I 特，I+K 投，H 判定；Enter 跳過教學');
  }

  private startFight(): void {
    this.demoPose = undefined;
    const playerMaxHealth = FIGHTER.maxHealth + this.upgrades.maxHealth;
    const aiMaxHealth = Math.round(FIGHTER.maxHealth * enemyHealthMultiplier(this.campaignSettings, this.currentEnemy));
    this.engine.configure({
      playerMaxHealth,
      aiMaxHealth,
      playerLightMultiplier: 1 + this.upgrades.lightPower,
      playerHeavyMultiplier: 1 + this.upgrades.heavyPower,
      aiDamageMultiplier: enemyDamageMultiplier(this.campaignSettings, this.currentEnemy),
    });
    this.engine.reset();
    this.ai.setDifficulty(this.campaignSettings.enemyStrength * (1 + (this.currentEnemy - 1) * 0.04));
    this.ai.reset();
    this.inputBuffer.reset();
    this.resetSuccessFlashTimers();
    this.assignCharacterTextures();
    this.setRoundOverActionsVisible(false);
    this.mode = 'fight';
    this.selectionOverlay.setVisible(false);
    this.shopOverlay.setVisible(false);
    this.setDebugToggleVisible(true);
    this.roundOverTimer = 0;
    this.modeText.setVisible(true);
    this.positionModeTextForPlay();
    this.modeText.setText(`FIGHT · 敵人 ${this.currentEnemy}/${this.campaignSettings.enemyCount}`);
    this.hintText.setText(`強度 ${Math.round(this.campaignSettings.enemyStrength * 100)}% · 抓前搖打 Counter，勝利可進商店強化。`);
  }

  private showCharacterSelect(): void {
    this.mode = 'select';
    this.resetSuccessFlashTimers();
    this.selectionOverlay.setVisible(true);
    this.shopOverlay.setVisible(false);
    this.setRoundOverActionsVisible(false);
    this.modeText.setVisible(true);
    this.positionModeTextForPlay();
    this.modeText.setText('');
    this.hintText.setText('');
    this.setDebugToggleVisible(false);
    this.playerSprite.setVisible(false);
    this.aiSprite.setVisible(false);
    this.playerAfterimage.setVisible(false);
    this.aiAfterimage.setVisible(false);
    this.throwRangeHint.setVisible(false);
    this.playerShadow.setVisible(false);
    this.aiShadow.setVisible(false);
    this.setTouchControlsVisible(false);
  }

  private startFromUrlIfRequested(): void {
    const params = new URLSearchParams(window.location.search);
    const character = params.get('start');
    if (character !== 'male' && character !== 'female') return;

    this.selectedCharacter = character;
    this.beginCampaign();
    this.useIdleAi = params.get('ai') === 'idle';
    if (params.get('mode') === 'fight') {
      this.startFight();
    } else {
      this.startTutorial();
    }

    if (params.get('debug') === 'off') {
      this.showDebugBoxes = false;
      this.updateDebugToggleUi();
      this.renderHitboxes(this.engine.snapshot());
      this.throwRangeHint.setVisible(false);
    }

    this.applyUrlTestOptions(params);
  }

  private applyUrlTestOptions(params: URLSearchParams): void {
    if (this.mode === 'fight') {
      const playerX = numberParam(params, 'playerX');
      const aiX = numberParam(params, 'aiX');
      if (playerX !== undefined) this.engine.player.x = Phaser.Math.Clamp(playerX, STAGE.left, STAGE.right);
      if (aiX !== undefined) this.engine.ai.x = Phaser.Math.Clamp(aiX, STAGE.left, STAGE.right);
    }

    const pose = params.get('pose');
    if (DEMO_POSES.has(pose as DemoPose)) this.demoPose = pose as DemoPose;

    const roundOver = params.get('roundOver');
    if (this.mode === 'fight' && (roundOver === 'player' || roundOver === 'ai' || roundOver === 'draw')) {
      this.engine.player.health = roundOver === 'ai' ? 0 : this.engine.player.maxHealth;
      this.engine.ai.health = roundOver === 'player' ? 0 : this.engine.ai.maxHealth;
      this.engine.winner = roundOver === 'draw' ? undefined : roundOver;
      this.engine.roundOver = true;
      this.finishRound(this.engine.snapshot());
    }
  }

  private applyDemoPoseState(): void {
    const player = this.engine.player;
    const ai = this.engine.ai;
    const playerFacing: Facing = player.x <= ai.x ? 1 : -1;
    player.facing = playerFacing;
    ai.facing = playerFacing === 1 ? -1 : 1;

    if (this.demoPose === 'heavyActive') {
      player.state = { kind: 'attackActive', remainingMs: ATTACKS.heavy.activeMs, attack: 'heavy', hasConnected: false };
      ai.state = { kind: 'idle', remainingMs: 0 };
      return;
    }

    if (this.demoPose === 'blocking') {
      player.state = { kind: 'blocking', remainingMs: Number.POSITIVE_INFINITY };
      ai.state = { kind: 'idle', remainingMs: 0 };
      return;
    }

    if (this.demoPose === 'blockstun') {
      player.state = { kind: 'blockstun', remainingMs: ATTACKS.light.blockstunMs };
      ai.state = { kind: 'idle', remainingMs: 0 };
      return;
    }

    if (this.demoPose === 'parry') {
      player.state = { kind: 'parry', remainingMs: PARRY.activeMs * 0.55 };
      ai.state = { kind: 'idle', remainingMs: 0 };
      return;
    }

    if (this.demoPose === 'parryFlash') {
      player.state = { kind: 'idle', remainingMs: 0 };
      ai.state = { kind: 'idle', remainingMs: 0 };
      this.playerParryFlashTimer = SUCCESS_FLASH_MS;
      return;
    }

    const progress = Phaser.Math.Clamp(numberParam(new URLSearchParams(window.location.search), 'poseProgress') ?? 0.58, 0, 0.98);
    player.state = { kind: 'throwRecovery', remainingMs: THROW.recoveryMs };
    ai.state = { kind: 'throwVictim', remainingMs: THROW.victimStunMs * (1 - progress) };
    ai.x = Phaser.Math.Clamp(player.x + player.facing * THROW.victimOffset, STAGE.left, STAGE.right);
  }

  private handleSelectionInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.chooseMale)) {
      this.selectedCharacter = 'male';
      this.beginCampaign();
      this.startTutorial();
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.chooseFemale)) {
      this.selectedCharacter = 'female';
      this.beginCampaign();
      this.startTutorial();
    }
  }

  private assignCharacterTextures(): void {
    const opponent: CharacterId = this.selectedCharacter === 'male' ? 'female' : 'male';
    this.playerSprite.setTexture(characterSheetKey(this.selectedCharacter), 0);
    this.aiSprite.setTexture(characterSheetKey(opponent), 0);
    this.playerAfterimage.setTexture(characterSheetKey(this.selectedCharacter), 0);
    this.aiAfterimage.setTexture(characterSheetKey(opponent), 0);
    this.scaleFighterSprite(this.playerSprite);
    this.scaleFighterSprite(this.aiSprite);
    this.scaleFighterSprite(this.playerAfterimage);
    this.scaleFighterSprite(this.aiAfterimage);
    this.playerSprite.setVisible(true);
    this.aiSprite.setVisible(true);
    this.playerShadow.setVisible(true);
    this.aiShadow.setVisible(true);
  }

  private scaleFighterSprite(sprite: Phaser.GameObjects.Sprite): void {
    sprite.displayHeight = BASE_FRAME_DISPLAY_HEIGHT;
    sprite.scaleX = sprite.scaleY;
  }

  private readPlayerIntent(dtMs: number): FighterIntent {
    const leftDown = this.keys.left.isDown || this.keys.a.isDown || this.touch('left').down;
    const rightDown = this.keys.right.isDown || this.keys.d.isDown || this.touch('right').down;
    const blockDown = this.keys.block.isDown || this.touch('block').down;

    const command = this.inputBuffer.update(dtMs, {
      light: Phaser.Input.Keyboard.JustDown(this.keys.light) || this.touch('light').justPressed,
      heavy: Phaser.Input.Keyboard.JustDown(this.keys.heavy) || this.touch('heavy').justPressed,
      heavyDown: this.keys.heavy.isDown || this.touch('heavy').down,
      special: Phaser.Input.Keyboard.JustDown(this.keys.special) || this.touch('special').justPressed,
      specialDown: this.keys.special.isDown || this.touch('special').down,
      throwButton: this.touch('throw').justPressed,
    });

    return {
      left: leftDown && !rightDown,
      right: rightDown && !leftDown,
      block: blockDown,
      command,
    };
  }

  private tutorialIntent(dtMs: number): FighterIntent {
    const snapshot = this.engine.snapshot();
    const ai = snapshot.ai;
    const player = snapshot.player;
    const distance = Math.abs(ai.x - player.x);
    this.tutorialAiTimer -= dtMs;

    if (this.tutorialStep === 0) {
      return { left: false, right: false, block: false };
    }

    if (this.tutorialStep === 1) {
      if (distance > 86) {
        return { left: ai.x > player.x, right: ai.x < player.x, block: false };
      }
      if (this.tutorialAiTimer <= 0) {
        this.tutorialAiTimer = 950;
        return { left: false, right: false, block: false, command: 'heavy' };
      }
    }

    if (this.tutorialStep === 2) {
      if (distance > 48) {
        return { left: ai.x > player.x, right: ai.x < player.x, block: true };
      }
      return { left: false, right: false, block: true };
    }

    if (this.tutorialStep === 3) {
      if (distance > 96) {
        return { left: ai.x > player.x, right: ai.x < player.x, block: false };
      }
      if (this.tutorialAiTimer <= 0) {
        this.tutorialAiTimer = 1_050;
        return { left: false, right: false, block: false, command: 'heavy' };
      }
    }

    return { left: false, right: false, block: false };
  }

  private advanceTutorial(snapshot: BattleSnapshot): void {
    for (const event of snapshot.events) {
      const playerDid = event.source === 'player';
      if (this.tutorialStep === 0 && playerDid && (event.type === 'hit' || event.type === 'counter')) {
        this.nextTutorialStep();
      } else if (this.tutorialStep === 1 && playerDid && (event.type === 'block' || event.type === 'parry')) {
        this.nextTutorialStep();
      } else if (this.tutorialStep === 2 && playerDid && event.type === 'throw') {
        this.nextTutorialStep();
      } else if (this.tutorialStep === 3 && playerDid && event.type === 'counter') {
        this.startFight();
      }
    }
  }

  private nextTutorialStep(): void {
    this.tutorialStep += 1;
    this.tutorialAiTimer = 0;
    if (this.tutorialStep >= TUTORIAL_STEPS.length) {
      this.startFight();
      return;
    }
    this.modeText.setText(TUTORIAL_STEPS[this.tutorialStep]);
  }

  private finishRound(snapshot: BattleSnapshot): void {
    if (this.mode === 'over' || this.mode === 'shop') return;
    if (snapshot.winner === 'player' && this.currentEnemy < this.campaignSettings.enemyCount) {
      this.coins += victoryReward(this.campaignSettings, this.currentEnemy);
      this.openShop();
      return;
    }
    this.mode = 'over';
    this.roundOverTimer = ROUND_FLOW.roundOverMs;
    const result = snapshot.winner === 'player'
      ? this.currentEnemy >= this.campaignSettings.enemyCount ? 'CAMPAIGN CLEAR' : 'YOU WIN'
      : snapshot.winner === 'ai' ? 'YOU LOSE' : 'DRAW';
    this.modeText.setVisible(true);
    this.modeText.setText(result);
    this.modeText.setY(154).setFontSize(34);
    this.hintText.setText(snapshot.winner === 'player' ? '全數敵人擊破！Enter 回到設定' : 'R：重試目前敵人　Enter：回到設定');
    this.hintText.setVisible(!this.isTouchUiVisible);
    this.setRoundOverActionsVisible(true);
  }

  private setRoundOverActionsVisible(visible: boolean): void {
    this.roundActionContainer.setVisible(visible);
  }

  private render(snapshot: BattleSnapshot): void {
    const playerPose = this.poseFor(snapshot.player, this.lastPlayerX);
    const aiPose = this.poseFor(snapshot.ai, this.lastAiX);
    this.setFighterFrame(this.playerSprite, snapshot.player, this.lastPlayerX);
    this.setFighterFrame(this.aiSprite, snapshot.ai, this.lastAiX);
    this.applyFighterPose(this.playerSprite, snapshot.player, playerPose);
    this.applyFighterPose(this.aiSprite, snapshot.ai, aiPose);
    this.renderAfterimage(this.playerAfterimage, this.playerSprite, snapshot.player, playerPose);
    this.renderAfterimage(this.aiAfterimage, this.aiSprite, snapshot.ai, aiPose);
    this.applyThrowVisibility(snapshot);
    this.playerShadow.setPosition(snapshot.player.x, STAGE.floorY + 4);
    this.aiShadow.setPosition(snapshot.ai.x, STAGE.floorY + 4);
    this.playerShadow.setScale(1 + Math.abs(playerPose.offsetY) * 0.01, 1);
    this.aiShadow.setScale(1 + Math.abs(aiPose.offsetY) * 0.01, 1);
    this.tintFighter(this.playerSprite, snapshot.player);
    this.tintFighter(this.aiSprite, snapshot.ai);
    this.renderHitboxes(snapshot);
    this.renderThrowRangeHint(snapshot);
    this.renderSpark();

    this.playerBar.width = 332 * (snapshot.player.health / snapshot.player.maxHealth);
    this.aiBar.width = 332 * (snapshot.ai.health / snapshot.ai.maxHealth);
    this.timerText.setText(String(Math.ceil(snapshot.timeRemainingMs / 1000)).padStart(2, '0'));

    if (this.eventTextTimer > 0) {
      this.eventTextTimer -= this.game.loop.delta;
    } else {
      this.eventText.setText('');
    }
    this.updateSuccessFlashTimers();

    this.updateTouchControlVisibility();
    this.updateTouchControlOpacity(snapshot);
    this.modeText.setVisible(!(this.isTouchUiVisible && this.eventTextTimer > 0));
    this.lastPlayerX = snapshot.player.x;
    this.lastAiX = snapshot.ai.x;
  }

  private handleEvents(events: CombatEvent[]): void {
    const event = events.find((item) => item.type !== 'whiff') ?? events[0];
    if (!event) return;

    if (event.type !== 'roundStart') {
      this.eventText.setText(event.label);
      this.eventTextTimer = 520;
    }

    if (event.impactX !== undefined && event.impactY !== undefined) {
      this.showImpactSpark(event);
    }

    if (event.type === 'parry' && event.source) {
      this.setParryFlash(event.source);
    }

    const key = event.type === 'counter' ? 'counter' : event.type;
    if (isSfxKey(key)) {
      this.playSfx(key, event.type === 'counter' ? 0.8 : 0.55);
    }
  }

  private playSfx(key: SfxKey, volume: number): void {
    if (this.unavailableSfx.has(key)) return;

    try {
      this.sound.play(key, { volume });
    } catch (error) {
      this.unavailableSfx.add(key);
      console.warn(`Skipping unavailable sound effect: ${key}`, error);
    }
  }

  private setParryFlash(fighterId: FighterId): void {
    if (fighterId === 'player') {
      this.playerParryFlashTimer = SUCCESS_FLASH_MS;
    } else {
      this.aiParryFlashTimer = SUCCESS_FLASH_MS;
    }
  }

  private updateSuccessFlashTimers(): void {
    const dt = this.game.loop.delta;
    this.playerParryFlashTimer = Math.max(0, this.playerParryFlashTimer - dt);
    this.aiParryFlashTimer = Math.max(0, this.aiParryFlashTimer - dt);
  }

  private resetSuccessFlashTimers(): void {
    this.playerParryFlashTimer = 0;
    this.aiParryFlashTimer = 0;
  }

  private tintFighter(sprite: Phaser.GameObjects.Sprite, fighter: FighterModel): void {
    const parryFlashTimer = fighter.id === 'player' ? this.playerParryFlashTimer : this.aiParryFlashTimer;

    if (parryFlashTimer > 0) {
      sprite.setTint(0xfacc15);
    } else if (fighter.state.kind === 'blockstun') {
      sprite.setTint(0x93c5fd);
    } else if (fighter.state.kind === 'hitstun' || fighter.state.kind === 'throwVictim' || fighter.state.kind === 'ko') {
      sprite.setTint(0xfca5a5);
    } else if (fighter.state.kind.startsWith('throw')) {
      sprite.setTint(0xfdba74);
    } else {
      sprite.clearTint();
    }
  }

  private touch(id: TouchButtonId): TouchButton {
    const button = this.touchButtons.get(id);
    if (!button) throw new Error(`Missing touch button: ${id}`);
    return button;
  }

  private releaseTouchButton(button: TouchButton): void {
    button.down = false;
    button.rect.setFillStyle(button.id === 'throw' ? 0xf97316 : 0x1f2937, TOUCH_BUTTON_ALPHA);
  }

  private clearTouchPresses(): void {
    for (const button of this.touchButtons.values()) {
      button.justPressed = false;
    }
  }

  private updateTouchControlVisibility(): void {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const shouldShow =
      this.sys.game.device.input.touch ||
      this.scale.width < 920 ||
      this.scale.height < 520 ||
      viewportWidth < 920 ||
      viewportHeight < 520;
    if (shouldShow !== this.isTouchUiVisible) {
      this.setTouchControlsVisible(shouldShow);
    }
  }

  private setTouchControlsVisible(visible: boolean): void {
    this.isTouchUiVisible = visible;
    for (const button of this.touchButtons.values()) {
      button.rect.setVisible(visible);
      button.label.setVisible(visible);
    }
    if (this.mode === 'over') {
      this.modeText.setY(154).setFontSize(34);
    } else {
      this.positionModeTextForPlay();
    }
    this.hintText.setVisible(!visible);
  }

  private positionModeTextForPlay(): void {
    this.modeText.setY(this.isTouchUiVisible ? 150 : 468).setFontSize(this.isTouchUiVisible ? 17 : 20);
  }

  private updateTouchControlOpacity(snapshot: BattleSnapshot): void {
    if (!this.isTouchUiVisible) return;

    const leftControlsShouldFade = snapshot.player.x < 230;
    const rightControlsShouldFade = snapshot.player.x > 560 || snapshot.ai.x > 580;

    for (const button of this.touchButtons.values()) {
      const isMoveButton = button.id === 'left' || button.id === 'right';
      const fade = isMoveButton ? leftControlsShouldFade : rightControlsShouldFade;
      const alpha = button.down ? 1 : fade ? TOUCH_BUTTON_FADED_ALPHA : 1;
      button.rect.setAlpha(alpha);
      button.label.setAlpha(button.down ? 1 : fade ? 0.68 : 1);
    }
  }

  private toggleDebugBoxes(): void {
    this.showDebugBoxes = !this.showDebugBoxes;
    this.updateDebugToggleUi();
    if (!this.showDebugBoxes) {
      this.renderBox(this.attackArc, undefined, 0xfacc15, true);
      this.renderBox(this.playerHurtboxViz, undefined, 0x22c55e, false);
      this.renderBox(this.aiHurtboxViz, undefined, 0xef4444, false);
      this.throwRangeHint.setVisible(false);
    }
  }

  private setDebugToggleVisible(visible: boolean): void {
    this.debugToggleRect.setVisible(visible);
    this.debugToggleText.setVisible(visible);
  }

  private updateDebugToggleUi(): void {
    const fill = this.showDebugBoxes ? 0x164e63 : 0x1f2937;
    const stroke = this.showDebugBoxes ? 0x67e8f9 : 0x64748b;
    this.debugToggleRect.setFillStyle(fill, 0.78).setStrokeStyle(2, stroke, 0.75);
    this.debugToggleText.setText(`判定 ${this.showDebugBoxes ? 'ON' : 'OFF'}`);
    this.debugToggleText.setColor(this.showDebugBoxes ? '#cffafe' : '#cbd5e1');
  }

  private updateOrientationOverlay(): void {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const shouldShow = this.isTouchUiVisible && viewportHeight > viewportWidth;
    this.orientationOverlay.setVisible(shouldShow);
  }

  private poseFor(fighter: FighterModel, previousX: number): FighterPose {
    const moving = Math.abs(fighter.x - previousX) > 0.35;
    const idleBob = Math.sin(this.sceneTimeMs / 180 + (fighter.id === 'player' ? 0 : 1.2)) * 2.5;
    const walkBob = Math.sin(this.sceneTimeMs / 58) * 5;
    const pose: FighterPose = {
      offsetX: 0,
      offsetY: moving ? walkBob : idleBob,
      scaleX: moving ? 1.03 : 1,
      scaleY: moving ? 0.98 : 1,
      rotation: moving ? fighter.facing * 0.035 : 0,
    };

    switch (fighter.state.kind) {
      case 'attackWindup': {
        const total = ATTACKS[fighter.state.attack ?? 'light'].windupMs;
        const progress = 1 - fighter.state.remainingMs / total;
        pose.offsetX = -fighter.facing * Phaser.Math.Linear(4, 18, progress);
        pose.offsetY = -3;
        pose.rotation = -fighter.facing * 0.08;
        pose.scaleX = 0.97;
        pose.scaleY = 1.03;
        break;
      }
      case 'attackActive': {
        const attack = fighter.state.attack ?? 'light';
        const progress = 1 - fighter.state.remainingMs / ATTACKS[attack].activeMs;
        const snap = Math.sin(progress * Math.PI);
        const baseReach = attack === 'heavy' ? 24 : 18;
        const peakReach = attack === 'heavy' ? 36 : 28;
        pose.offsetX = fighter.facing * Phaser.Math.Linear(baseReach, peakReach, snap);
        pose.offsetY = Phaser.Math.Linear(-2, -7, snap);
        pose.rotation = fighter.facing * Phaser.Math.Linear(0.06, 0.12, snap);
        pose.scaleX = Phaser.Math.Linear(1.04, attack === 'heavy' ? 1.13 : 1.09, snap);
        pose.scaleY = Phaser.Math.Linear(0.98, attack === 'heavy' ? 0.93 : 0.96, snap);
        break;
      }
      case 'attackRecovery': {
        const attack = fighter.state.attack ?? 'light';
        const progress = 1 - fighter.state.remainingMs / ATTACKS[attack].recoveryMs;
        const holdLimit = attack === 'heavy' ? 0.38 : 0.25;
        if (progress < holdLimit) {
          const hold = progress / holdLimit;
          const reach = attack === 'heavy' ? 28 : 20;
          pose.offsetX = fighter.facing * Phaser.Math.Linear(reach, 10, hold);
          pose.offsetY = Phaser.Math.Linear(-5, -1, hold);
          pose.rotation = fighter.facing * Phaser.Math.Linear(0.1, 0.04, hold);
          pose.scaleX = Phaser.Math.Linear(1.08, 1.01, hold);
          pose.scaleY = Phaser.Math.Linear(0.96, 1, hold);
        } else {
          const retract = (progress - holdLimit) / (1 - holdLimit);
          pose.offsetX = -fighter.facing * Phaser.Math.Linear(10, 4, retract);
          pose.offsetY = Phaser.Math.Linear(1, 0, retract);
          pose.rotation = fighter.facing * Phaser.Math.Linear(0.045, 0.02, retract);
          pose.scaleX = Phaser.Math.Linear(1, 0.99, retract);
          pose.scaleY = Phaser.Math.Linear(1.01, 1, retract);
        }
        break;
      }
      case 'blocking':
      case 'blockstun':
        pose.offsetX = -fighter.facing * 10;
        pose.offsetY = 2;
        pose.rotation = -fighter.facing * 0.05;
        pose.scaleX = 0.93;
        pose.scaleY = 1.02;
        break;
      case 'parry':
        pose.offsetX = -fighter.facing * 5;
        pose.offsetY = -5;
        pose.rotation = -fighter.facing * 0.08;
        pose.scaleX = 1.04;
        pose.scaleY = 0.97;
        break;
      case 'parryRecovery':
        pose.offsetX = -fighter.facing * 7;
        pose.rotation = -fighter.facing * 0.04;
        pose.scaleX = 0.98;
        pose.scaleY = 1.01;
        break;
      case 'parrySuccess':
        pose.offsetX = -fighter.facing * 16;
        pose.offsetY = -6;
        pose.rotation = -fighter.facing * 0.13;
        pose.scaleX = 0.94;
        pose.scaleY = 1.06;
        break;
      case 'throwWindup': {
        const progress = 1 - fighter.state.remainingMs / THROW.windupMs;
        pose.offsetX = fighter.facing * Phaser.Math.Linear(4, 18, progress);
        pose.rotation = fighter.facing * 0.05;
        pose.scaleX = 1.04;
        pose.scaleY = 0.97;
        break;
      }
      case 'throwActive': {
        const progress = 1 - fighter.state.remainingMs / THROW.activeMs;
        const snap = Math.sin(progress * Math.PI);
        pose.offsetX = fighter.facing * Phaser.Math.Linear(18, 32, snap);
        pose.offsetY = Phaser.Math.Linear(0, -4, snap);
        pose.rotation = fighter.facing * Phaser.Math.Linear(0.04, 0.11, snap);
        pose.scaleX = Phaser.Math.Linear(1.03, 1.1, snap);
        pose.scaleY = Phaser.Math.Linear(0.98, 0.94, snap);
        break;
      }
      case 'throwRecovery': {
        const progress = 1 - fighter.state.remainingMs / THROW.recoveryMs;
        pose.offsetX = -fighter.facing * Phaser.Math.Linear(8, 2, progress);
        pose.rotation = -fighter.facing * Phaser.Math.Linear(0.06, 0.02, progress);
        pose.scaleX = Phaser.Math.Linear(0.99, 1, progress);
        pose.scaleY = Phaser.Math.Linear(1.01, 1, progress);
        break;
      }
      case 'throwTech':
        pose.offsetX = -fighter.facing * 5;
        pose.rotation = -fighter.facing * 0.04;
        break;
      case 'throwVictim':
        pose.offsetX = -fighter.facing * 10;
        pose.offsetY = 8;
        pose.scaleX = 1;
        pose.scaleY = 1;
        break;
      case 'hitstun':
        pose.offsetX = -fighter.facing * 16;
        pose.offsetY = -6;
        pose.rotation = -fighter.facing * 0.14;
        pose.scaleX = 0.95;
        pose.scaleY = 1.04;
        break;
      case 'ko':
        pose.offsetY = 0;
        pose.rotation = 0;
        pose.scaleX = 1;
        pose.scaleY = 1;
        break;
      default:
        break;
    }

    return pose;
  }

  private setFighterFrame(sprite: Phaser.GameObjects.Sprite, fighter: FighterModel, previousX: number): void {
    const moving = Math.abs(fighter.x - previousX) > 0.35;
    const character: CharacterId = isFemaleTexture(sprite.texture.key) ? 'female' : 'male';
    const frame = frameForFighter(fighter, moving, character === 'female', this.sceneTimeMs);
    const phase = transitionPhase(fighter, moving, this.sceneTimeMs);
    sprite.setTexture(characterSheetKey(character, phase), frame);
  }

  private applyFighterPose(sprite: Phaser.GameObjects.Sprite, fighter: FighterModel, pose: FighterPose): void {
    const baseScale = BASE_FRAME_DISPLAY_HEIGHT / sprite.height;
    const floorLift = isFemaleTexture(sprite.texture.key) ? FEMALE_FLOOR_LIFT : 0;
    const visualScale = femaleVisualScaleCorrection(sprite, fighter);
    sprite
      .setPosition(fighter.x + pose.offsetX, STAGE.floorY + pose.offsetY + floorLift)
      .setScale(baseScale * pose.scaleX * visualScale, baseScale * pose.scaleY * visualScale)
      .setFlipX(fighter.facing < 0)
      .setRotation(pose.rotation);
  }

  private renderAfterimage(
    trail: Phaser.GameObjects.Sprite,
    sprite: Phaser.GameObjects.Sprite,
    fighter: FighterModel,
    pose: FighterPose,
  ): void {
    const state = fighter.state.kind;
    const attack = fighter.state.attack ?? 'light';
    const earlyAttackRecovery =
      state === 'attackRecovery' && fighter.state.remainingMs > ATTACKS[attack].recoveryMs * (attack === 'heavy' ? 0.58 : 0.72);
    const earlyThrowRecovery = state === 'throwRecovery' && fighter.state.remainingMs > THROW.recoveryMs * 0.7;
    const shouldShow = state === 'attackActive' || state === 'throwActive' || earlyAttackRecovery || earlyThrowRecovery;

    if (!shouldShow) {
      trail.setVisible(false);
      return;
    }

    const baseScale = BASE_FRAME_DISPLAY_HEIGHT / sprite.height;
    const floorLift = isFemaleTexture(sprite.texture.key) ? FEMALE_FLOOR_LIFT : 0;
    const lag = state.startsWith('throw') ? 28 : attack === 'heavy' ? 24 : 18;
    trail
      .setVisible(true)
      .setTexture(sprite.texture.key)
      .setFrame(sprite.frame.name)
      .setPosition(fighter.x + pose.offsetX - fighter.facing * lag, STAGE.floorY + pose.offsetY + floorLift)
      .setScale(baseScale * pose.scaleX * 0.98, baseScale * pose.scaleY * 0.98)
      .setFlipX(fighter.facing < 0)
      .setRotation(pose.rotation * 0.65)
      .setTint(state.startsWith('throw') ? 0xf0abfc : 0x93c5fd)
      .setAlpha(state === 'attackActive' || state === 'throwActive' ? 0.22 : 0.15)
      .setDepth(1);
  }

  private applyThrowVisibility(_snapshot: BattleSnapshot): void {
    this.aiSprite.setAlpha(1);
    this.playerSprite.setAlpha(1);
    this.playerSprite.setDepth(2);
    this.aiSprite.setDepth(2);

    if (_snapshot.player.state.kind === 'throwRecovery' && _snapshot.ai.state.kind === 'throwVictim') {
      this.playerSprite.setDepth(4);
      this.aiSprite.setDepth(3);
    } else if (_snapshot.ai.state.kind === 'throwRecovery' && _snapshot.player.state.kind === 'throwVictim') {
      this.aiSprite.setDepth(4);
      this.playerSprite.setDepth(3);
    }
  }

  private renderHitboxes(snapshot: BattleSnapshot): void {
    if (!this.showDebugBoxes) {
      this.renderBox(this.attackArc, undefined, 0xfacc15, true);
      this.renderBox(this.playerHurtboxViz, undefined, 0x22c55e, false);
      this.renderBox(this.aiHurtboxViz, undefined, 0xef4444, false);
      return;
    }

    const playerAction = activeActionBox(snapshot.player);
    const aiAction = activeActionBox(snapshot.ai);
    const activeBox = playerAction ?? aiAction;
    this.renderBox(this.attackArc, activeBox, activeBox ? hitboxColor(activeBox.level) : 0xfacc15, true);

    const shouldShowHurtboxes = Boolean(activeBox);
    this.renderBox(this.playerHurtboxViz, shouldShowHurtboxes ? fighterHurtbox(snapshot.player) : undefined, 0x22c55e, false);
    this.renderBox(this.aiHurtboxViz, shouldShowHurtboxes ? fighterHurtbox(snapshot.ai) : undefined, 0xef4444, false);
  }

  private renderThrowRangeHint(snapshot: BattleSnapshot): void {
    if (!this.showDebugBoxes) {
      this.throwRangeHint.setVisible(false);
      return;
    }

    const failedThrowFeedback = snapshot.player.state.kind === 'throwRecovery' && this.eventTextTimer > 0 && this.eventText.text === '投技距離不足';
    const shouldShow = snapshot.player.state.kind === 'throwWindup' || snapshot.player.state.kind === 'throwActive' || failedThrowFeedback;
    if (!shouldShow) {
      this.throwRangeHint.setVisible(false);
      return;
    }

    const box = throwHitbox(snapshot.player);
    const inRange = Boolean(overlapPoint(box, fighterHurtbox(snapshot.ai)));
    const color = inRange ? 0x38bdf8 : 0xc084fc;
    const width = box.right - box.left;
    const height = box.top - box.bottom;
    this.throwRangeHint
      .setVisible(true)
      .setPosition((box.left + box.right) / 2, STAGE.floorY - (box.bottom + box.top) / 2)
      .setDisplaySize(width, height)
      .setFillStyle(color, failedThrowFeedback ? 0.18 : 0.13)
      .setStrokeStyle(failedThrowFeedback ? 4 : 3, color, failedThrowFeedback ? 0.98 : 0.82)
      .setDepth(3.5)
      .setAlpha(1);
  }

  private renderBox(rect: Phaser.GameObjects.Rectangle, box: CombatBox | undefined, color: number, filled: boolean): void {
    if (!box) {
      rect.setVisible(false);
      return;
    }

    const width = box.right - box.left;
    const height = box.top - box.bottom;
    rect
      .setVisible(true)
      .setPosition((box.left + box.right) / 2, STAGE.floorY - (box.bottom + box.top) / 2)
      .setDisplaySize(width, height)
      .setFillStyle(color, filled ? 0.42 : 0.08)
      .setStrokeStyle(2, color, filled ? 0.9 : 0.55);
  }

  private showImpactSpark(event: CombatEvent): void {
    const x = event.impactX ?? 0;
    const y = STAGE.floorY - (event.impactY ?? 0);
    const color = event.type === 'counter' ? 0xfacc15 : event.type === 'parry' ? 0x38bdf8 : event.type === 'throw' ? 0xfb923c : 0xffffff;
    this.sparkTimer = event.type === 'counter' ? 360 : 260;
    this.sparkRing
      .setVisible(true)
      .setPosition(x, y)
      .setFillStyle(color, 0.14)
      .setStrokeStyle(3, color, 0.95)
      .setScale(1);
    this.sparkCore
      .setVisible(true)
      .setPosition(x, y)
      .setFillStyle(color, 0.95)
      .setScale(1);
  }

  private renderSpark(): void {
    if (this.sparkTimer <= 0) {
      this.sparkCore.setVisible(false);
      this.sparkRing.setVisible(false);
      return;
    }

    this.sparkTimer -= this.game.loop.delta;
    const progress = Phaser.Math.Clamp(1 - this.sparkTimer / 360, 0, 1);
    this.sparkRing.setScale(1 + progress * 1.4).setAlpha(1 - progress);
    this.sparkCore.setScale(1 + progress * 0.8).setAlpha(1 - progress * 0.8);
  }
}

function textStyle(size: number, color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
    fontSize: `${size}px`,
    color,
    stroke: '#05070c',
    strokeThickness: 4,
  };
}

function characterSheetKey(character: CharacterId, phase = 0): string {
  return CHARACTER_SHEETS[character].keys[phase];
}

function isFemaleTexture(key: string): boolean {
  return CHARACTER_SHEETS.female.keys.includes(key);
}

function transitionPhase(fighter: FighterModel, moving: boolean, sceneTimeMs: number): number {
  let phaseDuration = 42;
  if (fighter.state.kind === 'idle') phaseDuration = moving ? 27 : 80;
  else if (fighter.state.kind === 'blocking' || fighter.state.kind === 'blockstun') phaseDuration = 50;
  else if (fighter.state.kind === 'throwVictim' || fighter.state.kind.startsWith('throw')) phaseDuration = 44;
  else if (fighter.state.kind === 'hitstun' || fighter.state.kind === 'ko') phaseDuration = 36;
  return Math.floor(sceneTimeMs / phaseDuration) % 3;
}

function isSfxKey(key: string): key is SfxKey {
  return SFX_KEYS.has(key);
}

function femaleVisualScaleCorrection(sprite: Phaser.GameObjects.Sprite, fighter: FighterModel): number {
  if (!isFemaleTexture(sprite.texture.key)) return 1;

  const frameIndex = Number(sprite.frame.name);
  if (frameIndex !== 11) return 1;

  switch (fighter.state.kind) {
    case 'parry':
      return 1.15;
    case 'parryRecovery':
      return 1.1;
    case 'parrySuccess':
      return 1.06;
    default:
      return 1;
  }
}

function hitboxColor(level?: string): number {
  if (level === 'high') return 0xfacc15;
  if (level === 'mid') return 0xfb923c;
  if (level === 'throw') return 0xa855f7;
  return 0xffffff;
}

function frameForFighter(fighter: FighterModel, moving: boolean, isFemale = false, sceneTimeMs = 0): number {
  if (isFemale) return femaleFrameForFighter(fighter, moving, sceneTimeMs);

  switch (fighter.state.kind) {
    case 'attackWindup': {
      const attack = fighter.state.attack ?? 'light';
      const progress = 1 - fighter.state.remainingMs / ATTACKS[attack].windupMs;
      if (attack === 'heavy') return progress < 0.58 ? MALE_FRAMES.kickChamber : 4;
      return progress < 0.52 ? MALE_FRAMES.jabPrepare : 2;
    }
    case 'attackActive': {
      const attack = fighter.state.attack ?? 'light';
      const progress = 1 - fighter.state.remainingMs / ATTACKS[attack].activeMs;
      if (attack === 'heavy') return progress < 0.44 ? MALE_FRAMES.kickExtend : 5;
      return progress < 0.45 ? MALE_FRAMES.jabExtend : 3;
    }
    case 'attackRecovery':
      {
        const attack = fighter.state.attack ?? 'light';
        const recovery = ATTACKS[attack].recoveryMs;
        const progress = 1 - fighter.state.remainingMs / recovery;
        if (attack === 'heavy') {
          if (progress < 0.34) return 5;
          if (progress < 0.72) return MALE_FRAMES.kickChamber;
          return MALE_FRAMES.guardSettle;
        }
        if (progress < 0.3) return 3;
        if (progress < 0.7) return MALE_FRAMES.jabRecover;
        return MALE_FRAMES.guardSettle;
      }
    case 'throwWindup':
      return fighter.state.remainingMs < THROW.windupMs * 0.48 ? MALE_FRAMES.throwReach : 6;
    case 'throwActive':
      return MALE_FRAMES.throwPull;
    case 'throwRecovery':
      return fighter.state.remainingMs > THROW.recoveryMs * 0.56 ? 7 : MALE_FRAMES.throwRecover;
    case 'throwTech':
      return 6;
    case 'throwVictim':
      return maleThrowVictimFrame(fighter);
    case 'hitstun':
      return fighter.state.remainingMs > 115 ? MALE_FRAMES.hitDeep : fighter.state.remainingMs > 55 ? MALE_FRAMES.hitRecoil : 8;
    case 'ko':
      return 9;
    case 'blocking':
    case 'blockstun':
      return Math.floor(sceneTimeMs / 150) % 2 === 0 ? MALE_FRAMES.guardSettle : MALE_FRAMES.guardBrace;
    case 'parry':
    case 'parryRecovery':
    case 'parrySuccess':
      return MALE_FRAMES.parryReach;
    default:
      if (moving) {
        const walkFrames = [MALE_FRAMES.walkStart, 1, MALE_FRAMES.walkPass, MALE_FRAMES.walkRecover];
        return walkFrames[Math.floor(sceneTimeMs / 82) % walkFrames.length];
      }
      return Math.floor(sceneTimeMs / 240) % 2 === 0 ? 0 : MALE_FRAMES.idleBreath;
  }
}

function femaleFrameForFighter(fighter: FighterModel, moving: boolean, sceneTimeMs: number): number {
  switch (fighter.state.kind) {
    case 'attackWindup':
      if (fighter.state.attack === 'heavy') {
        const progress = 1 - fighter.state.remainingMs / ATTACKS.heavy.windupMs;
        if (progress > 0.76) return FEMALE_FRAMES.kickProcessV2;
        if (progress > 0.52) return FEMALE_FRAMES.kickPrepV2;
        if (progress > 0.38) return FEMALE_FRAMES.kickChamber;
        return 4;
      }
      return fighter.state.remainingMs < ATTACKS.light.windupMs * 0.42 ? 2 : FEMALE_FRAMES.jabRecover;
    case 'attackActive':
      return fighter.state.attack === 'heavy' ? FEMALE_FRAMES.kickActiveV2 : FEMALE_FRAMES.jabExtend;
    case 'attackRecovery': {
      const attack = fighter.state.attack ?? 'light';
      const recovery = ATTACKS[attack].recoveryMs;
      const progress = 1 - fighter.state.remainingMs / recovery;
      if (attack === 'heavy') {
        if (progress < 0.62) return FEMALE_FRAMES.kickActiveV2;
        return FEMALE_FRAMES.guardSettle;
      }
      if (progress < 0.36) return FEMALE_FRAMES.jabExtend;
      if (progress < 0.72) return FEMALE_FRAMES.jabRecover;
      return FEMALE_FRAMES.guardSettle;
    }
    case 'throwWindup':
      return fighter.state.remainingMs < THROW.windupMs * 0.45 ? FEMALE_FRAMES.throwReachV2 : FEMALE_FRAMES.forwardStep;
    case 'throwActive':
      return FEMALE_FRAMES.throwPullV2;
    case 'throwRecovery':
      return fighter.state.remainingMs > THROW.recoveryMs * 0.62 ? FEMALE_FRAMES.throwPullV2 : FEMALE_FRAMES.guardSettle;
    case 'throwTech':
      return FEMALE_FRAMES.forwardStep;
    case 'throwVictim':
      return femaleThrowVictimFrame(fighter);
    case 'hitstun':
      return fighter.state.remainingMs > 90 ? FEMALE_FRAMES.hitRecoil : 8;
    case 'ko':
      return 9;
    case 'blocking':
    case 'blockstun':
      return FEMALE_FRAMES.guardSettle;
    case 'parry':
    case 'parryRecovery':
    case 'parrySuccess':
      return 11;
    default:
      if (moving) {
        const walkPhase = Math.floor(sceneTimeMs / 95) % 3;
        return walkPhase === 0 ? 1 : walkPhase === 1 ? FEMALE_FRAMES.walkPass : FEMALE_FRAMES.walkRecover;
      }
      return Math.floor(sceneTimeMs / 260) % 2 === 0 ? 0 : FEMALE_FRAMES.idleBreath;
  }
}

function maleThrowVictimFrame(fighter: FighterModel): number {
  const progress = 1 - fighter.state.remainingMs / THROW.victimStunMs;
  if (progress < 0.14) return MALE_FRAMES.throwVictimCaught;
  if (progress < 0.28) return MALE_FRAMES.throwVictimPulled;
  if (progress < 0.46) return MALE_FRAMES.throwVictimFalling;
  if (progress < 0.62) return MALE_FRAMES.throwVictimLanding;
  if (progress < 0.76) return MALE_FRAMES.throwVictimGrounded;
  if (progress < 0.9) return MALE_FRAMES.throwVictimGetUp;
  return MALE_FRAMES.throwVictimRecover;
}

function femaleThrowVictimFrame(fighter: FighterModel): number {
  const progress = 1 - fighter.state.remainingMs / THROW.victimStunMs;
  if (progress < 0.22) return FEMALE_FRAMES.throwVictimCaught;
  if (progress < 0.5) return FEMALE_FRAMES.throwVictimFalling;
  if (progress < 0.72) return FEMALE_FRAMES.throwVictimLanding;
  if (progress < 0.88) return FEMALE_FRAMES.throwVictimGetUp;
  return FEMALE_FRAMES.throwVictimRecover;
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
