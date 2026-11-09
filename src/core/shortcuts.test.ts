import { describe, expect, it } from 'vitest';
import { matches, parseCombo, ShortcutManager } from './shortcuts';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('shortcuts', () => {
  it('maps mod to Cmd on macOS and Ctrl elsewhere', () => {
    const undo = parseCombo('mod+z');
    expect(matches(undo, key('z', { metaKey: true }), true)).toBe(true);
    expect(matches(undo, key('z', { ctrlKey: true }), true)).toBe(false);
    expect(matches(undo, key('z', { ctrlKey: true }), false)).toBe(true);
  });

  it('requires exact modifiers', () => {
    const redo = parseCombo('mod+shift+z');
    expect(matches(redo, key('Z', { ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(matches(parseCombo('mod+z'), key('z', { ctrlKey: true, shiftKey: true }), false)).toBe(false);
  });

  it('matches named keys', () => {
    expect(matches(parseCombo('escape'), key('Escape'), false)).toBe(true);
  });
});

describe('ShortcutManager.list', () => {
  it('groups combos by action and lists only the shortcut that runs', () => {
    const m = new ShortcutManager();
    const run = () => {};
    m.add({ keys: 'mod+shift+z', label: 'Redo', run });
    m.add({ keys: 'mod+y', label: 'Redo', run });
    m.add({ keys: 'escape', label: 'Clear selection', run });
    m.add({ keys: 'escape', label: 'Leave the tool', run });
    expect(m.list()).toEqual([
      { label: 'Redo', keys: ['mod+shift+z', 'mod+y'] },
      { label: 'Leave the tool', keys: ['escape'] },
    ]);
  });

  it('names keys readably', () => {
    const m = new ShortcutManager();
    expect(['escape', 'backspace', 'shift+d', '/', 'shift+?'].map((k) => m.format(k).replace('Ctrl+', ''))).toEqual(['Esc', '⌫', expect.stringMatching(/⇧\+?D/), '/', '?']);
  });
});
