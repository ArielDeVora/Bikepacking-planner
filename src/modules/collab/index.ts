import type { Entity } from '../../model/types';
import { defineModule } from '../../core/module';
import { editedBy } from '../../model/edited';
import Comments from './Comments.svelte';
import EditedBy from './EditedBy.svelte';
import FollowBanner from './FollowBanner.svelte';
import FollowSection from './FollowSection.svelte';
import SharingSection from './SharingSection.svelte';
import SuggestDialog from './SuggestDialog.svelte';
import { get } from 'svelte/store';
import type { MapMouseEvent } from 'maplibre-gl';
import { icons } from '../../lib/icons';
import { fitToTrip } from './fit';
import { badgeStore } from './badge-store';

const CONFLICT_TOAST_MS = 15_000;
const MAX_CONFLICT_TOASTS = 3;

export default defineModule({
  id: 'collab',
  setup(ctx) {
    const { ui, bus, cloud, commands, store, t } = ctx;

    const badges = badgeStore(ctx);
    const offSection = ui.addPanelSection({
      id: 'collab',
      title: ctx.readOnly ? t('follow.sectionTitle') : t('collab.title'),
      component: ctx.readOnly ? FollowSection : SharingSection,
      props: { ctx, badges },
      order: 80,
    });
    const offBanner = ctx.readOnly ? ui.addWidget({ id: 'collab.follow', component: FollowBanner, props: { ctx }, position: 'top', order: 0 }) : () => {};
    if (ctx.readOnly) fitToTrip(ctx.map, store);

    // Followers whose link allows it can suggest places: click the map, or "Suggest" on a search result.
    const SUGGEST_TOOL = 'follow.suggest';
    const suggestAt = (lngLat: [number, number], name = '') => ui.openDialog(SuggestDialog, { ctx, lngLat, name });
    const offSuggest: (() => void)[] = [];
    if (ctx.follow?.canSuggest) {
      ui.suggestPlace = (p) => suggestAt(p.lngLat, p.name);
      const onClick = (e: MapMouseEvent) => {
        if (get(ui.tool) !== SUGGEST_TOOL) return;
        ui.claim(e.originalEvent);
        ui.setTool(null);
        suggestAt([e.lngLat.lng, e.lngLat.lat]);
      };
      ctx.map.on('click', onClick);
      const active = { subscribe: (run: (v: boolean) => void) => ui.tool.subscribe((tool) => run(tool === SUGGEST_TOOL)) };
      offSuggest.push(
        ui.addTool({ id: SUGGEST_TOOL, label: t('suggest.tool'), icon: icons.pin, order: 30, active, viewOnly: true, keepSelection: true, run: () => ui.toggleTool(SUGGEST_TOOL) }),
        () => ctx.map.off('click', onClick),
        () => (ui.suggestPlace = null),
      );
    }
    const offEdited = ui.addCardSection({ id: 'collab.edited', component: EditedBy, props: { ctx }, order: 10 });
    const offComments = ui.addCardSection({
      id: 'collab.comments',
      component: Comments,
      props: { ctx },
      types: ['route', 'stage', 'group', 'segment', 'poi', 'zone', 'borderCrossing'],
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
      // The person who made the change; if it's an app filling in an older version of mine, the app's user.
      const author = cloud.isMine(editedBy(c.theirs)) ? c.theirs.updatedBy : editedBy(c.theirs);
      const name = cloud.profileOf(author)?.name || t('collab.someone');
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
      offBanner();
      offSuggest.forEach((off) => off());
      offEdited();
      offComments();
      offConflict();
    };
  },
});
