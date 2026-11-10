import { beforeEach, describe, expect, it } from 'vitest';
import { CommandStack } from '../../core/commands';
import { TripStore } from '../../core/store';
import type { Poi, VoteValue } from '../../model/types';
import { trip, TRIP_ID } from '../../test/fixtures';
import { approvals, CROWN_APPROVALS, tally, voteCommand, voteId, votesByPlace } from './votes';

let store: TripStore;
let commands: CommandStack;

const poi = (id: string): Poi => ({
  id,
  type: 'poi',
  tripId: TRIP_ID,
  lngLat: [7, 45],
  category: 'other',
  name: id,
  notes: '',
  links: [],
  status: 'idea',
  createdBy: 'zoe',
  updatedAt: 0,
  updatedBy: 'zoe',
  deleted: false,
});

const vote = (poiId: string, userId: string, value: VoteValue, isMine?: (id: string) => boolean) => {
  const cmd = voteCommand(store, { tripId: TRIP_ID, poiId, userId, value, label: 'vote', isMine });
  if (cmd) commands.run(cmd);
  return cmd;
};

const values = (poiId: string) => (votesByPlace(store).get(poiId) ?? []).map((v) => [v.userId, v.value]).sort();

beforeEach(() => {
  store = new TripStore();
  store.apply([trip(), poi('p1'), poi('p2')], 'load');
  commands = new CommandStack(store, () => 'me');
});

describe('votes', () => {
  it('gives each person one fixed, UUID-shaped id per place', () => {
    const id = voteId('p1', 'me');
    expect(id).toBe(voteId('p1', 'me'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set([id, voteId('p1', 'zoe'), voteId('p2', 'me')]).size).toBe(3);
  });

  it('casts, changes and takes back a vote', () => {
    vote('p1', 'me', 1);
    vote('p1', 'zoe', 2);
    expect(values('p1')).toEqual([['me', 1], ['zoe', 2]]);
    vote('p1', 'me', -1);
    expect(values('p1')).toEqual([['me', -1], ['zoe', 2]]);
    vote('p1', 'me', 0);
    expect(values('p1')).toEqual([['zoe', 2]]);
    expect(store.list('vote')).toHaveLength(2);
    commands.undo();
    expect(values('p1')).toEqual([['me', -1], ['zoe', 2]]);
  });

  it('does nothing when the vote is unchanged or there is none to take back', () => {
    vote('p1', 'me', 1);
    expect(vote('p1', 'me', 1)).toBeNull();
    expect(vote('p2', 'me', 0)).toBeNull();
  });

  it('counts a person once: a vote cast before signing in is taken back', () => {
    vote('p1', 'my-browser-id', 1);
    vote('p1', 'me', 2, (id) => id === 'me' || id === 'my-browser-id');
    expect(values('p1')).toEqual([['me', 2]]);
  });

  it('counts approvals (I’m in or GOATED) for the crown, at three people', () => {
    expect(CROWN_APPROVALS).toBe(3);
    vote('p1', 'a', 2);
    vote('p1', 'b', 1);
    vote('p1', 'c', -1);
    expect(approvals(votesByPlace(store).get('p1')!)).toBe(2);
    vote('p1', 'c', 1);
    expect(approvals(votesByPlace(store).get('p1')!)).toBe(3);
    vote('p1', 'a', 0);
    expect(approvals(votesByPlace(store).get('p1')!)).toBe(2);
  });

  it('tallies: GOATED 2, yes 1, not for me −1', () => {
    vote('p1', 'a', 2);
    vote('p1', 'b', 2);
    vote('p1', 'c', 1);
    vote('p1', 'd', -1);
    expect(tally(votesByPlace(store).get('p1')!)).toEqual({ score: 4, counts: { [-1]: 1, 1: 1, 2: 2 } });
  });
});
