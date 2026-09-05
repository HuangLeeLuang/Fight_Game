import { describe, expect, it } from 'vitest';
import {
  SHOP_PRODUCTS,
  emptyUpgrades,
  enemyDamageMultiplier,
  enemyHealthMultiplier,
  productLevel,
  productPrice,
  victoryReward,
} from '../src/game/campaign';

describe('campaign balancing', () => {
  it('scales later enemies and higher difficulty', () => {
    const settings = { enemyCount: 5, enemyStrength: 1.5 };
    expect(enemyHealthMultiplier(settings, 3)).toBeGreaterThan(enemyHealthMultiplier(settings, 1));
    expect(enemyDamageMultiplier(settings, 3)).toBeGreaterThan(1.5);
    expect(victoryReward(settings, 3)).toBeGreaterThan(victoryReward(settings, 1));
  });

  it('tracks levels and increases product prices', () => {
    const product = SHOP_PRODUCTS[1];
    const upgrades = emptyUpgrades();
    expect(productLevel(product, upgrades)).toBe(0);
    upgrades.lightPower += product.amount;
    expect(productLevel(product, upgrades)).toBe(1);
    expect(productPrice(product, 1)).toBeGreaterThan(productPrice(product, 0));
  });
});
