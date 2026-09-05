import { describe, expect, it } from 'vitest';
import { BattleEngine } from '../src/game/combat';

describe('BattleEngine', () => {
  it('applies counter damage when an attack catches startup', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 500;
    engine.player.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'heavy',
      hasConnected: false,
    };
    engine.ai.state = {
      kind: 'attackWindup',
      remainingMs: 180,
      attack: 'heavy',
    };

    const snapshot = engine.update(16);

    expect(snapshot.ai.health).toBe(78);
    const counter = snapshot.events.find((event) => event.type === 'counter');
    expect(counter).toBeDefined();
    expect(counter?.hitLevel).toBe('mid');
    expect(counter?.impactX).toBeGreaterThan(0);
    expect(counter?.impactY).toBeGreaterThan(0);
  });

  it('misses when active attack hitbox does not overlap the hurtbox', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 680;
    engine.player.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'heavy',
      hasConnected: false,
    };

    const snapshot = engine.update(16);

    expect(snapshot.ai.health).toBe(100);
    expect(snapshot.events.some((event) => event.type === 'hit' || event.type === 'counter')).toBe(false);
  });

  it('ends the round on KO', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 500;
    engine.ai.health = 10;
    engine.player.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'heavy',
      hasConnected: false,
    };

    const snapshot = engine.update(16);

    expect(snapshot.roundOver).toBe(true);
    expect(snapshot.winner).toBe('player');
    expect(snapshot.events.some((event) => event.type === 'ko')).toBe(true);
  });

  it('blocks incoming attacks without health damage', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 500;
    engine.ai.state = { kind: 'blocking', remainingMs: Number.POSITIVE_INFINITY };
    engine.player.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'light',
      hasConnected: false,
    };

    const snapshot = engine.update(
      16,
      { left: false, right: false, block: false },
      { left: false, right: false, block: true },
    );

    expect(snapshot.ai.health).toBe(100);
    const block = snapshot.events.find((event) => event.type === 'block');
    expect(block).toBeDefined();
    expect(block?.hitLevel).toBe('high');
  });

  it('auto-blocks incoming AI attacks when the player is neutral', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 500;
    engine.ai.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'light',
      hasConnected: false,
    };

    const snapshot = engine.update(
      16,
      { left: false, right: false, block: false },
      { left: false, right: false, block: false },
    );

    expect(snapshot.player.health).toBe(100);
    expect(snapshot.player.state.kind).toBe('blockstun');
    expect(snapshot.events.some((event) => event.type === 'block' && event.source === 'player')).toBe(true);
  });

  it('auto-blocks incoming AI attacks when the player retreats', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 500;
    engine.ai.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'light',
      hasConnected: false,
    };

    const snapshot = engine.update(
      16,
      { left: true, right: false, block: false },
      { left: false, right: false, block: false },
    );

    expect(snapshot.player.health).toBe(100);
    expect(snapshot.player.state.kind).toBe('blockstun');
    expect(snapshot.events.some((event) => event.type === 'block' && event.source === 'player')).toBe(true);
  });

  it('does not auto-block incoming AI attacks while the player advances', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 500;
    engine.ai.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'light',
      hasConnected: false,
    };

    const snapshot = engine.update(
      16,
      { left: false, right: true, block: false },
      { left: false, right: false, block: false },
    );

    expect(snapshot.player.health).toBe(94);
    expect(snapshot.player.state.kind).toBe('hitstun');
    expect(snapshot.events.some((event) => event.type === 'block' && event.source === 'player')).toBe(false);
  });

  it('parries an incoming attack and stuns the attacker', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 500;
    engine.ai.state = { kind: 'parry', remainingMs: 120 };
    engine.player.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'heavy',
      hasConnected: false,
    };

    const snapshot = engine.update(16);

    expect(snapshot.player.state.kind).toBe('parrySuccess');
    expect(snapshot.events.some((event) => event.type === 'parry' && event.source === 'ai')).toBe(true);
  });

  it('lets a buffered throw command tech an incoming throw', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 496;
    engine.ai.throwTechBufferMs = 100;
    engine.player.state = {
      kind: 'throwActive',
      remainingMs: 80,
      hasConnected: false,
    };

    const snapshot = engine.update(16);

    expect(snapshot.ai.health).toBe(100);
    expect(snapshot.events.some((event) => event.type === 'throwTech')).toBe(true);
  });

  it('holds both fighters longer after a clean throw connects', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 496;
    engine.player.state = {
      kind: 'throwActive',
      remainingMs: 80,
      hasConnected: false,
    };

    const snapshot = engine.update(16);

    expect(snapshot.ai.health).toBe(86);
    expect(snapshot.player.state.kind).toBe('throwRecovery');
    expect(snapshot.ai.state.kind).toBe('throwVictim');
    expect(snapshot.player.state.remainingMs).toBeGreaterThan(400);
    expect(snapshot.ai.state.remainingMs).toBeGreaterThan(500);
    expect(Math.abs(snapshot.ai.x - snapshot.player.x)).toBeLessThan(50);
  });

  it('reports when a throw finishes out of range', () => {
    const engine = new BattleEngine();
    engine.player.x = 450;
    engine.ai.x = 620;
    engine.player.state = {
      kind: 'throwActive',
      remainingMs: 8,
      hasConnected: false,
    };

    const snapshot = engine.update(16);

    expect(snapshot.ai.health).toBe(100);
    expect(snapshot.player.state.kind).toBe('throwRecovery');
    expect(snapshot.events.some((event) => event.type === 'throwMiss' && event.label === '投技距離不足')).toBe(true);
  });

  it('buffers an attack until recovery ends', () => {
    const engine = new BattleEngine();
    engine.player.state = { kind: 'attackRecovery', remainingMs: 40, attack: 'light' };

    engine.update(16, { left: false, right: false, block: false, command: 'heavy' });
    const snapshot = engine.update(32, { left: false, right: false, block: false });

    expect(snapshot.player.state.kind).toBe('attackWindup');
    expect(snapshot.player.state.attack).toBe('heavy');
  });

  it('applies campaign health and damage tuning', () => {
    const engine = new BattleEngine();
    engine.configure({
      playerMaxHealth: 140,
      aiMaxHealth: 160,
      playerLightMultiplier: 1.5,
      aiDamageMultiplier: 2,
    });
    engine.reset();

    expect(engine.player.health).toBe(140);
    expect(engine.ai.health).toBe(160);

    engine.player.x = 450;
    engine.ai.x = 500;
    engine.player.state = {
      kind: 'attackActive',
      remainingMs: 60,
      attack: 'light',
      hasConnected: false,
    };
    const snapshot = engine.update(16, { left: false, right: true, block: false });
    expect(snapshot.ai.health).toBe(151);
  });
});
