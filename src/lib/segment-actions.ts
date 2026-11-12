import type { ModuleContext } from '../core/module';
import type { Segment } from '../model/types';
import { chainSegments } from './chain';
import { arrangeCommand, groupCommand, inTripOrder, smartMergeCommand } from './segment-edits';
import { groupSegments } from './tree';

/** Gaps shorter than this aren't worth mentioning. */
const GAP_NOTE_M = 500;
/** Turning segments round must save at least this much distance between them to be suggested. */
const TURN_HINT_M = 200;

/** Fuses segments end to end (see smartMergeCommand), selects the result and says what was done. */
export function fuseAction(ctx: ModuleContext, segments: Segment[], keepId?: string): string | null {
  const { store, t } = ctx;
  const res = smartMergeCommand(store, segments, t('cmd.merge'), keepId);
  if (!res) return null;
  const keep = res.command.changes[0]!.id;
  ctx.commands.run(res.command);
  ctx.selection.set([keep]);
  const notes = [t('fuse.done', { n: segments.length })];
  if (res.reordered) notes.push(t('fuse.reordered'));
  if (res.reversed) notes.push(t('fuse.reversed', { n: res.reversed }));
  if (res.maxGapM >= GAP_NOTE_M) notes.push(t('fuse.gap', { km: (res.maxGapM / 1000).toFixed(1) }));
  ctx.ui.notify(notes.join(' '), 'info', notes.length > 1 ? 7000 : 4000);
  return keep;
}

/** Puts segments in order along the route, turning round those that run the other way. */
export function arrangeAction(ctx: ModuleContext, segments: Segment[]): void {
  const { t } = ctx;
  const res = arrangeCommand(ctx.store, segments, t('cmd.arrange'));
  if (!res) {
    ctx.ui.notify(t('arrange.none'));
    return;
  }
  ctx.commands.run(res.command);
  ctx.ui.notify(t('arrange.done', { moved: res.moved, reversed: res.reversed }));
}

/**
 * Groups segments within the stage of the first one (in trip order), in order along the route,
 * selects the new group, and offers to turn round segments that seem to run the other way.
 */
export function groupSegmentsAction(ctx: ModuleContext, segments: Segment[]): string | null {
  const { store, t } = ctx;
  const first = inTripOrder(store, segments)[0];
  if (!first) {
    ctx.ui.notify(t('group.selectFirst'));
    return null;
  }
  const n = store.list('group', (g) => g.stageId === first.stageId).length + 1;
  const res = groupCommand(store, segments, t('group.defaultName', { n }), t('cmd.group'));
  if (!res) return null;
  ctx.commands.run(res.command);
  ctx.selection.set([res.groupId]);
  if (segments.some((s) => s.stageId !== first.stageId)) {
    ctx.ui.notify(t('group.oneStage', { stage: store.get(first.stageId, 'stage')?.name ?? '' }));
  }
  const members = groupSegments(store, res.groupId);
  const sum = (g: number[]) => g.reduce((a, b) => a + b, 0);
  const turned = chainSegments(members);
  const saved = sum(chainSegments(members, { reverse: false }).gapsM) - sum(turned.gapsM);
  const reversed = turned.links.filter((l) => l.reversed).length;
  if (reversed && saved >= TURN_HINT_M) {
    ctx.ui.notify(t('group.turnHint', { n: reversed }), 'info', 10000, {
      label: t('group.turn'),
      run: () => arrangeAction(ctx, groupSegments(store, res.groupId)),
    });
  }
  return res.groupId;
}
