import type { Command, CommandStack } from '../commands';
import { newId } from '../../model/ids';
import { diffChange, mergeDiffs, type ChangeDiff, type Commit, type CommitKind } from './diff';

export interface RecorderOptions {
  tripId: () => string;
  userId: () => string;
  /** The commit's label from the command's label (e.g. "Undo: move segment"). */
  label: (kind: CommitKind, commandLabel: string) => string;
  /** Receives each finished commit. */
  save: (commit: Commit) => void;
  /** A commit still being added to (typing, dragging) is finished after this long without changes. */
  idleMs?: number;
}

/**
 * Turns commands into commits. Commands the undo stack merges (typing in a field, dragging a
 * point) become one commit, finished once nothing more comes for a moment.
 */
export class HistoryRecorder {
  #open: Commit | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #next: { kind: CommitKind; restoredTo?: string } | null = null;

  constructor(
    commands: CommandStack,
    private o: RecorderOptions,
  ) {
    commands.onCommit((cmd, kind, merged) => this.record(cmd, kind, merged));
  }

  /** The next command is a restore to this commit. */
  markRestore(restoredTo: string): void {
    this.#next = { kind: 'restore', restoredTo };
  }

  record(cmd: Command, kind: 'edit' | 'undo' | 'redo', merged: boolean): void {
    const diffs = cmd.changes.map(diffChange).filter((d): d is ChangeDiff => !!d);
    if (merged && this.#open && kind === 'edit') {
      for (const d of diffs) {
        const i = this.#open.changes.findIndex((c) => c.id === d.id);
        if (i < 0) this.#open.changes.push(d);
        else {
          const m = mergeDiffs(this.#open.changes[i]!, d);
          if (m) this.#open.changes[i] = m;
          else this.#open.changes.splice(i, 1);
        }
      }
      this.#arm();
      return;
    }
    this.flush();
    if (!diffs.length) return;
    const next = this.#next;
    this.#next = null;
    const finalKind: CommitKind = next?.kind ?? kind;
    this.#open = {
      id: newId(),
      tripId: this.o.tripId(),
      userId: this.o.userId(),
      at: Date.now(),
      label: this.o.label(finalKind, cmd.label),
      kind: finalKind,
      ...(next?.restoredTo ? { restoredTo: next.restoredTo } : {}),
      changes: diffs,
    };
    if (cmd.mergeKey && kind === 'edit') this.#arm();
    else this.flush();
  }

  /** Finishes the commit being added to, if any. */
  flush(): void {
    clearTimeout(this.#timer);
    const open = this.#open;
    this.#open = null;
    if (open?.changes.length) this.o.save(open);
  }

  #arm(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), this.o.idleMs ?? 4000);
  }
}
