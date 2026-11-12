import type { Gear, Trip } from '../../model/types';

/** Currencies offered in the lists (any ISO code works). */
export const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'CAD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'CNY', 'JPY'] as const;

/** Rough value of one unit in euros (late 2026), used until the trip sets its own rate. */
export const DEFAULT_EUR_RATES: Record<string, number> = {
  EUR: 1,
  CHF: 1.07,
  USD: 0.86,
  GBP: 1.14,
  CAD: 0.62,
  SEK: 0.09,
  NOK: 0.085,
  DKK: 0.134,
  PLN: 0.235,
  CZK: 0.041,
  CNY: 0.12,
  JPY: 0.0057,
};

export interface Money {
  /** Currency of totals and the cost split. */
  main: string;
  /** Value of one unit in euros, per currency (defaults overridden by the trip's own rates). */
  eur: Record<string, number>;
}

export function moneyOf(trip: Trip | undefined): Money {
  return { main: trip?.currency ?? 'EUR', eur: { ...DEFAULT_EUR_RATES, ...trip?.currencyRates } };
}

export const currencyOf = (g: Pick<Gear, 'currency'>) => g.currency ?? 'EUR';

/** How much one unit of `from` is worth in `to`; 1 when a rate is unknown. */
export function rate(money: Money, from: string, to = money.main): number {
  if (from === to) return 1;
  const a = money.eur[from];
  const b = money.eur[to];
  return a && b ? a / b : 1;
}

/** Currencies with no known rate: their prices count as if already in the main currency. */
export const unknownRate = (money: Money, code: string) => code !== money.main && (!money.eur[code] || !money.eur[money.main]);

/** The item with its price in the main currency (for totals and the cost split). */
export const inMain = (money: Money, g: Gear): Gear =>
  g.price === undefined ? g : { ...g, price: g.price * rate(money, currencyOf(g)), currency: money.main };

/**
 * The trip's rates after setting "1 `code` = `value` main": stored as euros per unit. For euros
 * themselves (when the main currency isn't euros), the main currency's rate changes instead.
 */
export function withRate(money: Money, code: string, value: number): Record<string, number> {
  if (!(value > 0) || code === money.main) return {};
  const mainEur = money.eur[money.main] ?? 1;
  return code === 'EUR' ? { [money.main]: 1 / value } : { [code]: value * mainEur };
}

export function formatMoney(amount: number, code: string): string {
  try {
    // Whole amounts without decimals (€240), others with cents (€85.60).
    const cents = Math.round(amount * 100) % 100 !== 0;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${code}`;
  }
}
