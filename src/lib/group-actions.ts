import type { ModuleContext } from '../core/module';
import type { Segment } from '../model/types';
import { groupCommand, inTripOrder } from './segment-edits';

/**
 * Groups segments within the stage of the first one (in trip order), selects the new group and
 * says when segments of other stages were left out. Returns the group's id.
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
  return res.groupId;
}
