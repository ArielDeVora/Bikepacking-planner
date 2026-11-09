import { describe, expect, it } from 'vitest';
import { matches, parseCombo } from './shortcuts';

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
