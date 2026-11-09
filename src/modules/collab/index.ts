import type { Entity } from '../../model/types';
import { defineModule } from '../../core/module';
import Comments from './Comments.svelte';
import EditedBy from './EditedBy.svelte';
import SharingSection from './SharingSection.svelte';

const CONFLICT_TOAST_MS = 15_000;
const MAX_CONFLICT_TOASTS = 3;

export default defineModule({
  id: 'collab',
  setup(ctx) {
    const { ui, bus, cloud, commands, store, t } = ctx;

    const offSection = ui.addPanelSection({
      id: 'collab',
      title: t('collab.title'),
      component: SharingSection,
      props: { ctx },
      order: 80,
    });
    const offEdited = ui.addCardSection({ id: 'collab.edited', component: EditedBy, props: { ctx }, order: 10 });
    const offComments = ui.addCardSection({
      id: 'collab.comments',
      component: Comments,
      props: { ctx },
      types: ['stage', 'group', 'segment', 'poi', 'zone', 'borderCrossing'],
      order: 20,
    });

    const restore = (version: Entity) =>
      commands.run({ label: t('cmd.restoreVersion'), changes: [{ id: version.id, before: store.getRaw(version.id) ?? null, after: version }] });

    // One notice per entity at a time, and only a few at once.
    const recent = new Map<string, number>();
    const offConflict = bus.on('cloud:conflict', (c) => {
      const now = Date.now();
      for (const [id, at] of recent) if (now - at > CONFLICT_TOAST_MS) recent.delete(id);
      if (recent.has(c.id) || recent.size >= MAX_CONFLICT_TOASTS) return;
      recent.set(c.id, now);
      const name = cloud.profileOf(c.theirs.updatedBy)?.name || t('collab.someone');
      const label = ('name' in c.mine && c.mine.name) || t('collab.untitled');
      if (c.kind === 'overwritten') {
        ui.notify(t('collab.conflictOverwritten', { name, label }), 'warn', CONFLICT_TOAST_MS, {
          label: t('collab.keepMine'),
          run: () => restore(c.mine),
        });
      } else {
        ui.notify(t('collab.conflictOverwrote', { name, label }), 'info', CONFLICT_TOAST_MS, {
          label: t('collab.useTheirs'),
          run: () => restore(c.theirs),
        });
      }
    });

    return () => {
      offSection();
      offEdited();
      offComments();
      offConflict();
    };
  },
});
