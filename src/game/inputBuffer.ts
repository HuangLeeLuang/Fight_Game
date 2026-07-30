import { INPUT_BUFFER_MS } from './constants';
import type { Command } from './types';

export interface ButtonPresses {
  light?: boolean;
  heavy?: boolean;
  heavyDown?: boolean;
  special?: boolean;
  specialDown?: boolean;
  throwButton?: boolean;
}

type BufferedButton = 'light' | 'heavy' | 'special';

export class ComboInputBuffer {
  private readonly bufferMs: number;
  private timers = new Map<BufferedButton, number>();

  constructor(bufferMs = INPUT_BUFFER_MS) {
    this.bufferMs = bufferMs;
  }

  update(dtMs: number, presses: ButtonPresses): Command | undefined {
    this.tick(dtMs);

    if (presses.light) this.timers.set('light', this.bufferMs);
    if (presses.heavy) this.timers.set('heavy', this.bufferMs);
    if (presses.special) this.timers.set('special', this.bufferMs);

    if (presses.throwButton) {
      this.clear('heavy', 'special');
      return 'throw';
    }

    const hasHeavy = this.has('heavy') || Boolean(presses.heavyDown);
    const hasSpecial = this.has('special') || Boolean(presses.specialDown);

    if (hasHeavy && hasSpecial) {
      this.clear('heavy', 'special');
      return 'throw';
    }

    if (presses.special) {
      this.clear('special');
      return 'parry';
    }

    if (presses.heavy) {
      this.clear('heavy');
      return 'heavy';
    }

    if (presses.light) {
      this.clear('light');
      return 'light';
    }

    return undefined;
  }

  reset(): void {
    this.timers.clear();
  }

  private tick(dtMs: number): void {
    for (const [button, remaining] of this.timers.entries()) {
      const next = remaining - dtMs;
      if (next <= 0) {
        this.timers.delete(button);
      } else {
        this.timers.set(button, next);
      }
    }
  }

  private has(button: BufferedButton): boolean {
    return (this.timers.get(button) ?? 0) > 0;
  }

  private clear(...buttons: BufferedButton[]): void {
    for (const button of buttons) {
      this.timers.delete(button);
    }
  }
}
