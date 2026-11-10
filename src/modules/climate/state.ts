import { writable } from 'svelte/store';
import { weekOf } from './codec';

export type Shown = 'temp' | 'rain' | null;

export interface ClimateState {
  /** The overlay on the map. */
  shown: Shown;
  /** Temperatures: daytime highs or night lows. */
  temp: 'tmax' | 'tmin';
  /** Week of the year shown, 0–51. */
  week: number;
  playing: boolean;
}

export const createClimateState = (week = weekOf(new Date())) =>
  writable<ClimateState>({ shown: null, temp: 'tmax', week, playing: false });
