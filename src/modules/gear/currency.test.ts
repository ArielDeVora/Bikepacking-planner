import { describe, expect, it } from 'vitest';
import type { Gear, Trip } from '../../model/types';
import { currencyOf, formatMoney, inMain, moneyOf, rate, withRate } from './currency';

const trip = (over: Partial<Trip> = {}) => ({ id: 't', type: 'trip', name: 'T', ...over }) as Trip;
const gear = (over: Partial<Gear>) => ({ id: 'g', type: 'gear', name: 'x', qty: 1, ...over }) as Gear;

describe('gear currencies', () => {
  it('reads prices without a currency as euros', () => {
    expect(currencyOf(gear({}))).toBe('EUR');
    expect(moneyOf(undefined).main).toBe('EUR');
  });

  it('converts to the trip currency with its own rates over the defaults', () => {
    const money = moneyOf(trip({ currency: 'CHF', currencyRates: { CHF: 1.1 } }));
    expect(rate(money, 'EUR')).toBeCloseTo(1 / 1.1);
    expect(inMain(money, gear({ price: 110, currency: 'EUR' })).price).toBeCloseTo(100);
    expect(inMain(money, gear({ price: 50, currency: 'CHF' })).price).toBe(50);
    expect(inMain(money, gear({})).price).toBeUndefined();
  });

  it('stores an edited rate as euros per unit', () => {
    const chf = moneyOf(trip({ currency: 'CHF' }));
    expect(withRate(chf, 'EUR', 0.9)).toEqual({ CHF: 1 / 0.9 });
    expect(withRate(chf, 'USD', 0.8)).toEqual({ USD: 0.8 * 1.07 });
    expect(withRate(chf, 'CHF', 2)).toEqual({});
  });

  it('formats amounts in their currency', () => {
    expect(formatMoney(12.5, 'CHF')).toMatch(/CHF/);
    expect(formatMoney(3, 'XYZ')).toMatch(/3/);
  });
});
