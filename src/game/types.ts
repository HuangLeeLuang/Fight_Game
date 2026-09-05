export type FighterId = 'player' | 'ai';
export type Facing = -1 | 1;
export type AttackKind = 'light' | 'heavy';
export type Command = AttackKind | 'parry' | 'throw';
export type HitLevel = 'high' | 'mid' | 'throw';

export type FighterStateKind =
  | 'idle'
  | 'attackWindup'
  | 'attackActive'
  | 'attackRecovery'
  | 'blocking'
  | 'blockstun'
  | 'hitstun'
  | 'parry'
  | 'parryRecovery'
  | 'parrySuccess'
  | 'throwWindup'
  | 'throwActive'
  | 'throwRecovery'
  | 'throwVictim'
  | 'throwTech'
  | 'ko';

export interface FighterState {
  kind: FighterStateKind;
  remainingMs: number;
  attack?: AttackKind;
  hasConnected?: boolean;
}

export interface FighterModel {
  id: FighterId;
  name: string;
  x: number;
  facing: Facing;
  health: number;
  maxHealth: number;
  state: FighterState;
  pendingCommand?: Command;
  commandBufferMs: number;
  throwTechBufferMs: number;
}

export interface BattleTuning {
  playerMaxHealth: number;
  aiMaxHealth: number;
  playerLightMultiplier: number;
  playerHeavyMultiplier: number;
  aiDamageMultiplier: number;
}

export interface FighterIntent {
  left: boolean;
  right: boolean;
  block: boolean;
  command?: Command;
}

export type CombatEventType =
  | 'hit'
  | 'counter'
  | 'block'
  | 'parry'
  | 'throw'
  | 'throwTech'
  | 'throwMiss'
  | 'whiff'
  | 'ko'
  | 'roundStart'
  | 'timeOver';

export interface CombatEvent {
  type: CombatEventType;
  source?: FighterId;
  target?: FighterId;
  damage?: number;
  hitLevel?: HitLevel;
  impactX?: number;
  impactY?: number;
  label: string;
}

export interface BattleSnapshot {
  player: FighterModel;
  ai: FighterModel;
  timeRemainingMs: number;
  roundOver: boolean;
  winner?: FighterId;
  events: CombatEvent[];
  hitStopMs: number;
}
