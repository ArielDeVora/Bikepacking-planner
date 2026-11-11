import { describe, expect, it, vi } from 'vitest';
import { CommandStack, edits } from './commands';
import { TripStore } from './store';
import { UiRegistry } from './ui';
import { trip } from '../test/fixtures';
import { get } from 'svelte/store';
import type { Trip } from '../model/types';

describe('read-only view', () => {
  it('changes nothing and says why', () => {
    const store = new TripStore();
    store.apply([trip()], 'load');
    const commands = new CommandStack(store, () => 'me');
    const locked = vi.fn();
    commands.locked = locked;
    const before = store.all()[0]!;
    commands.run({ label: 'rename', changes: [edits.update<Trip>(store, before.id, { name: 'Other' })] });
    commands.patch([edits.update<Trip>(store, before.id, { name: 'Other' })]);
    commands.undo();
    expect(store.all()[0]).toEqual(before);
    expect(locked).toHaveBeenCalledTimes(2);
  });

  it('keeps only the tools that change nothing', () => {
    const ui = new UiRegistry();
    ui.readOnly = true;
    ui.addTool({ id: 'draw', label: 'Draw', icon: '', run: () => {} });
    ui.addTool({ id: 'profile', label: 'Profile', icon: '', viewOnly: true, run: () => {} });
    expect(get(ui.tools).map((tool) => tool.id)).toEqual(['profile']);
  });
});
