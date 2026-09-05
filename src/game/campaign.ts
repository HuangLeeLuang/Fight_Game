export interface CampaignSettings {
  enemyCount: number;
  enemyStrength: number;
}

export type ProductStat = 'maxHealth' | 'lightPower' | 'heavyPower';

export interface ShopProduct {
  id: string;
  name: string;
  description: string;
  stat: ProductStat;
  amount: number;
  basePrice: number;
  maxLevel: number;
}

export interface PlayerUpgrades {
  maxHealth: number;
  lightPower: number;
  heavyPower: number;
}

export const ENEMY_COUNT_OPTIONS = [1, 3, 5, 8];
export const ENEMY_STRENGTH_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

// 商品集中定義於此，日後可直接增刪或調整價格、效果與等級上限。
export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    id: 'vital-core',
    name: '生命核心',
    description: '血量上限 +20',
    stat: 'maxHealth',
    amount: 20,
    basePrice: 80,
    maxLevel: 5,
  },
  {
    id: 'knuckle-drive',
    name: '拳擊驅動器',
    description: '拳擊傷害 +15%',
    stat: 'lightPower',
    amount: 0.15,
    basePrice: 70,
    maxLevel: 5,
  },
  {
    id: 'leg-amplifier',
    name: '腿技增幅器',
    description: '踢擊傷害 +15%',
    stat: 'heavyPower',
    amount: 0.15,
    basePrice: 70,
    maxLevel: 5,
  },
];

export function emptyUpgrades(): PlayerUpgrades {
  return { maxHealth: 0, lightPower: 0, heavyPower: 0 };
}

export function productLevel(product: ShopProduct, upgrades: PlayerUpgrades): number {
  if (product.stat === 'maxHealth') return Math.round(upgrades.maxHealth / product.amount);
  return Math.round(upgrades[product.stat] / product.amount);
}

export function productPrice(product: ShopProduct, level: number): number {
  return Math.round(product.basePrice * (1 + level * 0.45));
}

export function enemyHealthMultiplier(settings: CampaignSettings, enemyNumber: number): number {
  return 1 + (settings.enemyStrength - 1) * 0.5 + (enemyNumber - 1) * 0.08;
}

export function enemyDamageMultiplier(settings: CampaignSettings, enemyNumber: number): number {
  return settings.enemyStrength * (1 + (enemyNumber - 1) * 0.045);
}

export function victoryReward(settings: CampaignSettings, enemyNumber: number): number {
  return Math.round(70 * settings.enemyStrength + enemyNumber * 12);
}
