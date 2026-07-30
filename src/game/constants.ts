export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const ROUND_TIME_MS = 45_000;
export const INPUT_BUFFER_MS = 110;

export const STAGE = {
  left: 80,
  right: 880,
  floorY: 404,
  center: 480,
};

export const FIGHTER = {
  width: 46,
  height: 82,
  moveSpeed: 260,
  blockPush: 18,
  hitPush: 34,
  maxHealth: 100,
};

export const ATTACKS = {
  light: {
    damage: 6,
    counterDamage: 10,
    hitLevel: 'high',
    windupMs: 95,
    activeMs: 75,
    recoveryMs: 145,
    hitstunMs: 170,
    blockstunMs: 120,
    range: 62,
    hitbox: {
      offset: 40,
      width: 70,
      bottom: 112,
      top: 170,
    },
  },
  heavy: {
    damage: 16,
    counterDamage: 22,
    hitLevel: 'mid',
    windupMs: 230,
    activeMs: 95,
    recoveryMs: 285,
    hitstunMs: 275,
    blockstunMs: 155,
    range: 84,
    hitbox: {
      offset: 56,
      width: 90,
      bottom: 128,
      top: 186,
    },
  },
} as const;

export const THROW = {
  damage: 14,
  windupMs: 165,
  activeMs: 100,
  recoveryMs: 520,
  victimStunMs: 640,
  victimOffset: 34,
  range: 50,
  techBufferMs: 170,
  hitbox: {
    offset: 18,
    width: 58,
    bottom: 42,
    top: 154,
  },
};

export const PARRY = {
  activeMs: 155,
  failRecoveryMs: 320,
  attackerStunMs: 390,
  successFreezeMs: 120,
};

export const ROUND_FLOW = {
  introMs: 950,
  roundOverMs: 2_000,
  hitStopMs: 70,
  counterHitStopMs: 120,
};

export const AI = {
  decisionMinMs: 260,
  decisionMaxMs: 620,
  reactionDelayMinMs: 220,
  reactionDelayMaxMs: 360,
  preferredRange: 78,
  mistakeChance: 0.22,
};
