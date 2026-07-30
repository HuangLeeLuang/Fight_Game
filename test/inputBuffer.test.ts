import { describe, expect, it } from 'vitest';
import { ComboInputBuffer } from '../src/game/inputBuffer';

describe('ComboInputBuffer', () => {
  it('turns near-simultaneous special and heavy presses into throw', () => {
    const buffer = new ComboInputBuffer(110);

    expect(buffer.update(16, { special: true, specialDown: true })).toBe('parry');
    expect(buffer.update(70, { heavy: true, specialDown: true })).toBe('throw');
  });

  it('supports a dedicated mobile throw button', () => {
    const buffer = new ComboInputBuffer(110);

    expect(buffer.update(16, { throwButton: true })).toBe('throw');
  });

  it('does not compose throw after the buffer expires', () => {
    const buffer = new ComboInputBuffer(80);

    expect(buffer.update(16, { special: true })).toBe('parry');
    expect(buffer.update(90, {})).toBeUndefined();
    expect(buffer.update(16, { heavy: true })).toBe('heavy');
  });
});
