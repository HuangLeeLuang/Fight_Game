import { AI, ATTACKS } from './constants';
import type { BattleSnapshot, FighterIntent } from './types';

type AiMode = 'approach' | 'pressure' | 'guard' | 'bait' | 'mistake';

export class SimpleAiController {
  private mode: AiMode = 'approach';
  private decisionMs = 0;
  private reactionMs = 0;
  private pendingReaction?: FighterIntent;

  update(snapshot: BattleSnapshot, dtMs: number): FighterIntent {
    const ai = snapshot.ai;
    const player = snapshot.player;
    const distance = Math.abs(ai.x - player.x);

    this.decisionMs -= dtMs;
    this.reactionMs -= dtMs;

    if (this.pendingReaction && this.reactionMs <= 0) {
      const intent = this.pendingReaction;
      this.pendingReaction = undefined;
      return intent;
    }

    if (!this.pendingReaction && player.state.kind === 'attackWindup') {
      this.pendingReaction = { left: false, right: false, block: true };
      this.reactionMs = randomBetween(AI.reactionDelayMinMs, AI.reactionDelayMaxMs);
    }

    if (this.decisionMs <= 0) {
      this.mode = this.chooseMode(distance);
      this.decisionMs = randomBetween(AI.decisionMinMs, AI.decisionMaxMs);
    }

    if (ai.state.kind !== 'idle' && ai.state.kind !== 'blocking') {
      return idleIntent();
    }

    switch (this.mode) {
      case 'approach':
        return {
          left: ai.x > player.x + AI.preferredRange,
          right: ai.x < player.x - AI.preferredRange,
          block: false,
        };
      case 'pressure':
        return distance <= ATTACKS.heavy.range
          ? maybeCommand(Math.random() < 0.45 ? 'light' : 'heavy')
          : {
              left: ai.x > player.x,
              right: ai.x < player.x,
              block: false,
            };
      case 'guard':
        return { left: false, right: false, block: true };
      case 'bait':
        return {
          left: ai.x < player.x,
          right: ai.x > player.x,
          block: false,
        };
      case 'mistake':
        return distance <= ATTACKS.heavy.range + 28
          ? maybeCommand(Math.random() < 0.5 ? 'heavy' : 'throw')
          : maybeCommand('heavy');
      default:
        return idleIntent();
    }
  }

  reset(): void {
    this.mode = 'approach';
    this.decisionMs = 0;
    this.reactionMs = 0;
    this.pendingReaction = undefined;
  }

  private chooseMode(distance: number): AiMode {
    if (Math.random() < AI.mistakeChance) return 'mistake';
    if (distance > AI.preferredRange + 28) return Math.random() < 0.72 ? 'approach' : 'bait';
    const roll = Math.random();
    if (roll < 0.54) return 'pressure';
    if (roll < 0.74) return 'guard';
    return 'bait';
  }
}

function idleIntent(): FighterIntent {
  return { left: false, right: false, block: false };
}

function maybeCommand(command: FighterIntent['command']): FighterIntent {
  return { left: false, right: false, block: false, command };
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
