export interface Shortcut {
  /** e.g. "mod+z", "mod+shift+z", "d", "escape". `mod` is Cmd on macOS, Ctrl elsewhere. */
  keys: string;
  label: string;
  run: (e: KeyboardEvent) => void;
  /** Also works while a full-screen view (planning…) is open. */
  global?: boolean;
}

interface Combo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export function parseCombo(keys: string): Combo {
  const parts = keys.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  return { key, mod: parts.includes('mod'), shift: parts.includes('shift'), alt: parts.includes('alt') };
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

export function matches(combo: Combo, e: KeyLike, isMac: boolean): boolean {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  return (
    e.key.toLowerCase() === combo.key &&
    mod === combo.mod &&
    e.shiftKey === combo.shift &&
    e.altKey === combo.alt
  );
}

function isEditable(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

const KEY_NAMES: Record<string, string> = {
  escape: 'Esc',
  enter: 'Enter',
  delete: 'Delete',
  backspace: '⌫',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  ' ': 'Space',
};

export class ShortcutManager {
  #shortcuts: { combo: Combo; shortcut: Shortcut }[] = [];
  #isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  add(shortcut: Shortcut): () => void {
    const entry = { combo: parseCombo(shortcut.keys), shortcut };
    this.#shortcuts.push(entry);
    return () => {
      this.#shortcuts = this.#shortcuts.filter((s) => s !== entry);
    };
  }

  /** Human-readable form of a combo for tooltips. */
  format(keys: string): string {
    const parts = keys.split('+');
    // A symbol such as "?" already implies the Shift needed to type it.
    const key = parts.at(-1) ?? '';
    const symbol = key.length === 1 && !/[a-z0-9]/i.test(key);
    return parts
      .filter((k) => !(symbol && k === 'shift'))
      .map((k) => (k === 'mod' ? (this.#isMac ? '⌘' : 'Ctrl') : k === 'shift' ? '⇧' : k === 'alt' ? (this.#isMac ? '⌥' : 'Alt') : (KEY_NAMES[k] ?? k.toUpperCase())))
      .join(this.#isMac ? '' : '+');
  }

  /**
   * The shortcuts in effect, in registration order, with combos that do the same thing grouped
   * (e.g. Redo: ⌘⇧Z, ⌘Y). Where two shortcuts share a combo, only the one that runs is listed.
   */
  list(): { label: string; keys: string[] }[] {
    const effective = new Map<string, Shortcut>();
    for (const { shortcut } of this.#shortcuts) effective.set(shortcut.keys.toLowerCase(), shortcut);
    const byLabel = new Map<string, string[]>();
    for (const [keys, s] of effective) byLabel.set(s.label, [...(byLabel.get(s.label) ?? []), keys]);
    return [...byLabel].map(([label, keys]) => ({ label, keys }));
  }

  /** While a full-screen view is open, only global shortcuts (undo, redo…) apply. */
  paused = false;

  handle = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || isEditable(e.target)) return;
    for (let i = this.#shortcuts.length - 1; i >= 0; i--) {
      const { combo, shortcut } = this.#shortcuts[i]!;
      if (this.paused && !shortcut.global) continue;
      if (matches(combo, e, this.#isMac)) {
        e.preventDefault();
        shortcut.run(e);
        return;
      }
    }
  };
}
