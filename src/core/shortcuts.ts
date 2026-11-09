export interface Shortcut {
  /** e.g. "mod+z", "mod+shift+z", "d", "escape". `mod` is Cmd on macOS, Ctrl elsewhere. */
  keys: string;
  label: string;
  run: (e: KeyboardEvent) => void;
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
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

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
    return keys
      .split('+')
      .map((k) => (k === 'mod' ? (this.#isMac ? '⌘' : 'Ctrl') : k === 'shift' ? '⇧' : k.toUpperCase()))
      .join(this.#isMac ? '' : '+');
  }

  handle = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || isEditable(e.target)) return;
    for (let i = this.#shortcuts.length - 1; i >= 0; i--) {
      const { combo, shortcut } = this.#shortcuts[i]!;
      if (matches(combo, e, this.#isMac)) {
        e.preventDefault();
        shortcut.run(e);
        return;
      }
    }
  };
}
