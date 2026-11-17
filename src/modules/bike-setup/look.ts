import type { PartId } from './setup';

/** Fill colour of each part, on the bike and on its card. */
export const PART_COLORS: Record<PartId, string> = {
  rearRack: '#868e96',
  frontRack: '#868e96',
  rearPanniers: '#e8590c',
  frontPanniers: '#f59f00',
  rearTop: '#1c7ed6',
  frontTop: '#1098ad',
  frameBag: '#5c677d',
  handlebarBag: '#2f9e44',
  seatPack: '#7048e8',
  topTubeBag: '#c2255c',
  cageDown: '#4dabf7',
  cageSeat: '#4dabf7',
  cageUnder: '#4dabf7',
  cageFork: '#82c91e',
};

/** Where each part's number sits on the drawing, in view units. */
export const ANCHORS: Partial<Record<PartId, [number, number]>> = {
  rearPanniers: [123.5, 268],
  frontPanniers: [643.5, 261.5],
  rearTop: [145, 128],
  frontTop: [710, 128],
  frameBag: [400, 179],
  handlebarBag: [655, 104],
  seatPack: [175, 80],
  topTubeBag: [482.5, 91],
  cageDown: [420.5, 262.5],
  cageUnder: [435.5, 336.5],
  cageSeat: [335.5, 261.5],
  cageFork: [610.5, 234.5],
};
