import type { Command } from '../core/commands';
import type { t as translate } from '../core/i18n';
import type { Core } from '../core/core';
import type { Entity } from '../model/types';

const SHOWN_MS = 8000;
const MAX_NAMES = 2;
const PARENTS = ['groupId', 'stageId', 'routeId'] as const;

/**
 * What a command did, in words: its label, the names of what it changed, and where they went
 * when they all moved to the same place ("Move segment: “Segment 3” → Stage 2").
 */
export function describeCommand(cmd: Command, nameOf: (id: string) => string | undefined): string {
  const named = (e: Entity | null) => (e && 'name' in e && typeof e.name === 'string' && e.name ? e.name : undefined);
  const names = [...new Set(cmd.changes.map((c) => named(c.after) ?? named(c.before)).filter((n): n is string => !!n))];
  let text = cmd.label.charAt(0).toLocaleUpperCase() + cmd.label.slice(1);
  if (names.length) {
    const shown = names.slice(0, MAX_NAMES).map((n) => `“${n}”`).join(', ');
    text += `: ${shown}${names.length > MAX_NAMES ? ` +${names.length - MAX_NAMES}` : ''}`;
  }
  // Moved: every moved item has the same new parent (the innermost one that changed).
  const targets = new Set<string>();
  for (const c of cmd.changes) {
    if (!c.before) continue;
    const before = c.before as unknown as Record<string, unknown>;
    const after = c.after as unknown as Record<string, unknown>;
    const key = PARENTS.find((k) => after[k] !== before[k] && typeof after[k] === 'string');
    if (key) targets.add(after[key] as string);
  }
  const target = targets.size === 1 ? nameOf([...targets][0]!) : undefined;
  if (target) text += ` → ${target}`;
  return text;
}

const lower = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1);

/** Whether the change came from typing in a field, which shows the change by itself. */
const typing = () => {
  const el = document.activeElement;
  return !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'range', 'color'].includes(el.type)));
};

/** A notice after each change, undo and redo, with a button to take it back. */
export function watchCommands(core: Core, t: typeof translate): () => void {
  let last: number | null = null;
  const nameOf = (id: string) => {
    const e = core.store.getRaw(id) as { name?: string } | undefined;
    return e?.name || undefined;
  };
  return core.commands.onCommit((cmd, kind, merged) => {
    if (merged || core.readOnly || !core.prefs.current.undoNotices) return;
    if (kind === 'edit' && typing()) return;
    if (last !== null) core.ui.dismiss(last);
    const text = describeCommand(cmd, nameOf);
    last =
      kind === 'undo'
        ? core.ui.notify(t('undo.undone', { what: lower(text) }), 'info', SHOWN_MS, { label: t('toolbar.redo'), run: () => core.commands.redo() })
        : core.ui.notify(kind === 'redo' ? t('undo.redone', { what: lower(text) }) : text, 'info', SHOWN_MS, {
            label: t('toolbar.undo'),
            run: () => core.commands.undo(),
          });
  });
}
