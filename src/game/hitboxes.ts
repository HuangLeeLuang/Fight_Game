import { ATTACKS, THROW } from './constants';
import type { AttackKind, FighterModel, HitLevel } from './types';

export interface CombatBox {
  left: number;
  right: number;
  bottom: number;
  top: number;
  level?: HitLevel;
}

export interface HitboxOverlap {
  x: number;
  y: number;
}

const HURTBOX = {
  width: 58,
  bottom: 8,
  top: 196,
};

export function fighterHurtbox(fighter: FighterModel): CombatBox {
  return {
    left: fighter.x - HURTBOX.width / 2,
    right: fighter.x + HURTBOX.width / 2,
    bottom: HURTBOX.bottom,
    top: HURTBOX.top,
  };
}

export function attackHitbox(fighter: FighterModel, attack: AttackKind): CombatBox {
  const data = ATTACKS[attack];
  return projectedBox(fighter, data.hitbox, data.hitLevel);
}

export function throwHitbox(fighter: FighterModel): CombatBox {
  return projectedBox(fighter, THROW.hitbox, 'throw');
}

export function activeActionBox(fighter: FighterModel): CombatBox | undefined {
  if (fighter.state.kind === 'attackActive') {
    return attackHitbox(fighter, fighter.state.attack ?? 'light');
  }

  if (fighter.state.kind === 'throwActive') {
    return throwHitbox(fighter);
  }

  return undefined;
}

export function overlapPoint(hitbox: CombatBox, hurtbox: CombatBox): HitboxOverlap | undefined {
  const left = Math.max(hitbox.left, hurtbox.left);
  const right = Math.min(hitbox.right, hurtbox.right);
  const bottom = Math.max(hitbox.bottom, hurtbox.bottom);
  const top = Math.min(hitbox.top, hurtbox.top);

  if (left >= right || bottom >= top) return undefined;

  return {
    x: (left + right) / 2,
    y: (bottom + top) / 2,
  };
}

function projectedBox(
  fighter: FighterModel,
  spec: { offset: number; width: number; bottom: number; top: number },
  level: HitLevel,
): CombatBox {
  if (fighter.facing > 0) {
    return {
      left: fighter.x + spec.offset,
      right: fighter.x + spec.offset + spec.width,
      bottom: spec.bottom,
      top: spec.top,
      level,
    };
  }

  return {
    left: fighter.x - spec.offset - spec.width,
    right: fighter.x - spec.offset,
    bottom: spec.bottom,
    top: spec.top,
    level,
  };
}
