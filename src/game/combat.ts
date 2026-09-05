import {
  ATTACKS,
  FIGHTER,
  INPUT_BUFFER_MS,
  PARRY,
  ROUND_FLOW,
  ROUND_TIME_MS,
  STAGE,
  THROW,
} from './constants';
import { attackHitbox, fighterHurtbox, overlapPoint, throwHitbox } from './hitboxes';
import type {
  AttackKind,
  BattleSnapshot,
  BattleTuning,
  CombatEvent,
  Command,
  FighterId,
  FighterIntent,
  FighterModel,
  FighterState,
} from './types';

const EMPTY_INTENT: FighterIntent = {
  left: false,
  right: false,
  block: false,
};

const DEFAULT_TUNING: BattleTuning = {
  playerMaxHealth: FIGHTER.maxHealth,
  aiMaxHealth: FIGHTER.maxHealth,
  playerLightMultiplier: 1,
  playerHeavyMultiplier: 1,
  aiDamageMultiplier: 1,
};

export class BattleEngine {
  player: FighterModel;
  ai: FighterModel;
  timeRemainingMs = ROUND_TIME_MS;
  roundOver = false;
  winner?: FighterId;
  hitStopMs = 0;

  private events: CombatEvent[] = [];
  private tuning: BattleTuning = { ...DEFAULT_TUNING };

  constructor() {
    this.player = createFighter('player', 'Player', 315, this.tuning.playerMaxHealth);
    this.ai = createFighter('ai', 'Rival', 645, this.tuning.aiMaxHealth);
    this.faceEachOther();
  }

  configure(tuning: Partial<BattleTuning>): void {
    this.tuning = { ...this.tuning, ...tuning };
  }

  reset(): void {
    this.player = createFighter('player', 'Player', 315, this.tuning.playerMaxHealth);
    this.ai = createFighter('ai', 'Rival', 645, this.tuning.aiMaxHealth);
    this.timeRemainingMs = ROUND_TIME_MS;
    this.roundOver = false;
    this.winner = undefined;
    this.hitStopMs = 0;
    this.events = [{ type: 'roundStart', label: 'ROUND START' }];
    this.faceEachOther();
  }

  update(dtMs: number, playerIntent = EMPTY_INTENT, aiIntent = EMPTY_INTENT): BattleSnapshot {
    this.events = [];
    if (this.roundOver) {
      return this.snapshot();
    }

    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - dtMs);
      return this.snapshot();
    }

    this.timeRemainingMs = Math.max(0, this.timeRemainingMs - dtMs);
    if (this.timeRemainingMs === 0) {
      this.finishByTime();
      return this.snapshot();
    }

    this.applyCommandBuffer(this.player, playerIntent.command, dtMs);
    this.applyCommandBuffer(this.ai, aiIntent.command, dtMs);

    this.advanceState(this.player, dtMs);
    this.advanceState(this.ai, dtMs);

    this.resolveCommands(this.player, playerIntent);
    this.resolveCommands(this.ai, aiIntent);

    this.moveFighter(this.player, playerIntent, dtMs);
    this.moveFighter(this.ai, aiIntent, dtMs);

    this.faceEachOther();
    this.resolveActiveActions(this.player, this.ai, aiIntent);
    this.resolveActiveActions(this.ai, this.player, playerIntent);
    this.clampSpacing();

    return this.snapshot();
  }

  snapshot(): BattleSnapshot {
    return {
      player: cloneFighter(this.player),
      ai: cloneFighter(this.ai),
      timeRemainingMs: this.timeRemainingMs,
      roundOver: this.roundOver,
      winner: this.winner,
      events: [...this.events],
      hitStopMs: this.hitStopMs,
    };
  }

  private applyCommandBuffer(fighter: FighterModel, command: Command | undefined, dtMs: number): void {
    fighter.commandBufferMs = Math.max(0, fighter.commandBufferMs - dtMs);
    fighter.throwTechBufferMs = Math.max(0, fighter.throwTechBufferMs - dtMs);
    if (fighter.commandBufferMs === 0) {
      fighter.pendingCommand = undefined;
    }

    if (!command) return;

    fighter.pendingCommand = command;
    fighter.commandBufferMs = INPUT_BUFFER_MS;
    if (command === 'throw') {
      fighter.throwTechBufferMs = THROW.techBufferMs;
    }
  }

  private resolveCommands(fighter: FighterModel, intent: FighterIntent): void {
    if (this.roundOver || !isControllable(fighter)) return;

    const command = fighter.pendingCommand;
    if (command === 'light' || command === 'heavy') {
      this.clearPendingCommand(fighter);
      this.startAttack(fighter, command);
      return;
    }

    if (command === 'parry') {
      this.clearPendingCommand(fighter);
      fighter.state = state('parry', PARRY.activeMs);
      return;
    }

    if (command === 'throw') {
      this.clearPendingCommand(fighter);
      fighter.state = state('throwWindup', THROW.windupMs);
      return;
    }

    if (intent.block) {
      fighter.state = state('blocking', Number.POSITIVE_INFINITY);
    } else if (fighter.state.kind === 'blocking') {
      fighter.state = state('idle', 0);
    }
  }

  private clearPendingCommand(fighter: FighterModel): void {
    fighter.pendingCommand = undefined;
    fighter.commandBufferMs = 0;
  }

  private startAttack(fighter: FighterModel, attack: AttackKind): void {
    fighter.state = {
      kind: 'attackWindup',
      remainingMs: ATTACKS[attack].windupMs,
      attack,
      hasConnected: false,
    };
  }

  private advanceState(fighter: FighterModel, dtMs: number): void {
    if (fighter.state.kind === 'ko' || fighter.state.kind === 'blocking') return;

    fighter.state.remainingMs -= dtMs;
    if (fighter.state.remainingMs > 0) return;

    switch (fighter.state.kind) {
      case 'attackWindup':
        fighter.state = {
          kind: 'attackActive',
          remainingMs: ATTACKS[fighter.state.attack ?? 'light'].activeMs,
          attack: fighter.state.attack,
          hasConnected: false,
        };
        break;
      case 'attackActive':
        if (!fighter.state.hasConnected) {
          this.events.push({
            type: 'whiff',
            source: fighter.id,
            label: fighter.id === 'player' ? '攻擊揮空' : '對手揮空',
          });
        }
        fighter.state = {
          kind: 'attackRecovery',
          remainingMs: ATTACKS[fighter.state.attack ?? 'light'].recoveryMs,
          attack: fighter.state.attack,
        };
        break;
      case 'throwWindup':
        fighter.state = state('throwActive', THROW.activeMs);
        break;
      case 'throwActive':
        if (!fighter.state.hasConnected) {
          this.events.push({
            type: 'throwMiss',
            source: fighter.id,
            hitLevel: 'throw',
            label: '投技距離不足',
          });
        }
        fighter.state = state('throwRecovery', THROW.recoveryMs);
        break;
      case 'parry':
        fighter.state = state('parryRecovery', PARRY.failRecoveryMs);
        break;
      default:
        fighter.state = state('idle', 0);
        break;
    }
  }

  private moveFighter(fighter: FighterModel, intent: FighterIntent, dtMs: number): void {
    if (!canMove(fighter)) return;

    const direction = Number(intent.right) - Number(intent.left);
    if (direction === 0) return;

    const speed = fighter.state.kind === 'blocking' ? FIGHTER.moveSpeed * 0.34 : FIGHTER.moveSpeed;
    fighter.x += direction * speed * (dtMs / 1000);
    fighter.x = Math.max(STAGE.left, Math.min(STAGE.right, fighter.x));
  }

  private resolveActiveActions(attacker: FighterModel, defender: FighterModel, defenderIntent: FighterIntent): void {
    if (this.roundOver) return;

    if (attacker.state.kind === 'attackActive' && !attacker.state.hasConnected) {
      this.resolveAttack(attacker, defender, defenderIntent);
    }

    if (attacker.state.kind === 'throwActive' && !attacker.state.hasConnected) {
      this.resolveThrow(attacker, defender);
    }
  }

  private resolveAttack(attacker: FighterModel, defender: FighterModel, defenderIntent: FighterIntent): void {
    const attack = attacker.state.attack ?? 'light';
    const data = ATTACKS[attack];
    const impact = overlapPoint(attackHitbox(attacker, attack), fighterHurtbox(defender));
    if (!impact) return;

    attacker.state.hasConnected = true;

    if (defender.state.kind === 'parry') {
      attacker.state = state('parrySuccess', PARRY.attackerStunMs);
      defender.state = state('idle', 0);
      this.hitStopMs = PARRY.successFreezeMs;
      this.events.push({
        type: 'parry',
        source: defender.id,
        target: attacker.id,
        hitLevel: data.hitLevel,
        impactX: impact.x,
        impactY: impact.y,
        label: `PARRY ${levelLabel(data.hitLevel)}`,
      });
      return;
    }

    if (canGuardAttack(defender, defenderIntent, attacker)) {
      defender.state = state('blockstun', data.blockstunMs);
      attacker.x -= attacker.facing * FIGHTER.blockPush;
      this.events.push({
        type: 'block',
        source: defender.id,
        target: attacker.id,
        hitLevel: data.hitLevel,
        impactX: impact.x,
        impactY: impact.y,
        label: `BLOCK ${levelLabel(data.hitLevel)}`,
      });
      return;
    }

    const counter = isCounterable(defender);
    const baseDamage = counter ? data.counterDamage : data.damage;
    const multiplier = attacker.id === 'player'
      ? attack === 'light'
        ? this.tuning.playerLightMultiplier
        : this.tuning.playerHeavyMultiplier
      : this.tuning.aiDamageMultiplier;
    const damage = Math.max(1, Math.round(baseDamage * multiplier));
    defender.health = Math.max(0, defender.health - damage);
    defender.state = state('hitstun', data.hitstunMs);
    defender.x += attacker.facing * FIGHTER.hitPush;
    this.hitStopMs = counter ? ROUND_FLOW.counterHitStopMs : ROUND_FLOW.hitStopMs;
    this.events.push({
      type: counter ? 'counter' : 'hit',
      source: attacker.id,
      target: defender.id,
      damage,
      hitLevel: data.hitLevel,
      impactX: impact.x,
      impactY: impact.y,
      label: counter ? `COUNTER ${levelLabel(data.hitLevel)}` : `HIT ${levelLabel(data.hitLevel)}`,
    });
    this.checkKo(attacker, defender);
  }

  private resolveThrow(attacker: FighterModel, defender: FighterModel): void {
    const impact = overlapPoint(throwHitbox(attacker), fighterHurtbox(defender));
    if (!impact) return;

    attacker.state.hasConnected = true;

    if (defender.throwTechBufferMs > 0) {
      attacker.state = state('throwTech', 210);
      defender.state = state('throwTech', 210);
      this.events.push({
        type: 'throwTech',
        source: defender.id,
        target: attacker.id,
        hitLevel: 'throw',
        impactX: impact.x,
        impactY: impact.y,
        label: 'THROW TECH',
      });
      return;
    }

    const throwDamage = Math.max(
      1,
      Math.round(THROW.damage * (attacker.id === 'ai' ? this.tuning.aiDamageMultiplier : 1)),
    );
    defender.health = Math.max(0, defender.health - throwDamage);
    defender.state = state('throwVictim', THROW.victimStunMs);
    attacker.state = state('throwRecovery', THROW.recoveryMs);
    defender.x = attacker.x + attacker.facing * THROW.victimOffset;
    this.hitStopMs = ROUND_FLOW.hitStopMs;
    this.events.push({
      type: 'throw',
      source: attacker.id,
      target: defender.id,
      damage: throwDamage,
      hitLevel: 'throw',
      impactX: impact.x,
      impactY: impact.y,
      label: 'THROW',
    });
    this.checkKo(attacker, defender);
  }

  private checkKo(attacker: FighterModel, defender: FighterModel): void {
    if (defender.health > 0) return;

    defender.state = state('ko', 0);
    this.roundOver = true;
    this.winner = attacker.id;
    this.events.push({
      type: 'ko',
      source: attacker.id,
      target: defender.id,
      label: 'KO',
    });
  }

  private finishByTime(): void {
    this.roundOver = true;
    if (this.player.health === this.ai.health) {
      this.winner = undefined;
    } else {
      this.winner = this.player.health > this.ai.health ? 'player' : 'ai';
    }
    this.events.push({
      type: 'timeOver',
      source: this.winner,
      label: 'TIME OVER',
    });
  }

  private inRange(attacker: FighterModel, defender: FighterModel, range: number): boolean {
    return Math.abs(attacker.x - defender.x) <= range;
  }

  private faceEachOther(): void {
    this.player.facing = this.player.x <= this.ai.x ? 1 : -1;
    this.ai.facing = this.ai.x <= this.player.x ? 1 : -1;
  }

  private clampSpacing(): void {
    this.player.x = Math.max(STAGE.left, Math.min(STAGE.right, this.player.x));
    this.ai.x = Math.max(STAGE.left, Math.min(STAGE.right, this.ai.x));

    const gap = Math.abs(this.player.x - this.ai.x);
    const minGap = 34;
    if (gap >= minGap) return;

    const midpoint = (this.player.x + this.ai.x) / 2;
    this.player.x = midpoint - minGap / 2;
    this.ai.x = midpoint + minGap / 2;
  }
}

function createFighter(id: FighterId, name: string, x: number, maxHealth: number): FighterModel {
  return {
    id,
    name,
    x,
    facing: id === 'player' ? 1 : -1,
    health: maxHealth,
    maxHealth,
    state: state('idle', 0),
    pendingCommand: undefined,
    commandBufferMs: 0,
    throwTechBufferMs: 0,
  };
}

function state(kind: FighterState['kind'], remainingMs: number): FighterState {
  return { kind, remainingMs };
}

function cloneFighter(fighter: FighterModel): FighterModel {
  return {
    ...fighter,
    state: { ...fighter.state },
  };
}

function isControllable(fighter: FighterModel): boolean {
  return fighter.state.kind === 'idle' || fighter.state.kind === 'blocking';
}

function canMove(fighter: FighterModel): boolean {
  return fighter.state.kind === 'idle' || fighter.state.kind === 'blocking';
}

function canGuardAttack(defender: FighterModel, intent: FighterIntent, attacker: FighterModel): boolean {
  if (defender.facing !== -attacker.facing) return false;
  if (defender.state.kind === 'blocking') return true;
  return defender.id === 'player' && defender.state.kind === 'idle' && isNeutralOrRetreating(defender, intent);
}

function isNeutralOrRetreating(fighter: FighterModel, intent: FighterIntent): boolean {
  if (intent.command || intent.block) return false;

  const direction = Number(intent.right) - Number(intent.left);
  if (direction === 0) return !intent.left && !intent.right;
  return direction === -fighter.facing;
}

function isCounterable(fighter: FighterModel): boolean {
  return fighter.state.kind === 'attackWindup' || fighter.state.kind === 'throwWindup';
}

function levelLabel(level: 'high' | 'mid' | 'throw'): string {
  if (level === 'high') return 'HIGH';
  if (level === 'mid') return 'MID';
  return 'THROW';
}
