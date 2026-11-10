import { KEYS } from '../../config/shortcuts';
import { derived, get } from 'svelte/store';
import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import {
  duplicateCommand,
  makeEditableCommand,
  moveToStageCommand,
  nextSegment,
  reverseCommand,
} from '../../lib/segment-edits';
import { fuseAction, groupSegmentsAction } from '../../lib/segment-actions';
import EditCard from './EditCard.svelte';
import MultiCard from './MultiCard.svelte';
import { EditTools, ERASE_TOOL, FOLLOW_TOOL, PREVIEW, SPLIT_TOOL } from './tools';

export interface EditActions {
  split: () => void;
  erase: () => void;
  follow: () => void;
  /** These act on the given segment, or the selected one. */
  reverse: (id?: string) => void;
  duplicate: (id?: string) => void;
  merge: (id?: string) => void;
  moveTo: (id: string, stageId: string) => void;
  makeEditable: (id: string) => void;
}

export default defineModule({
  id: 'editing',
  setup(ctx) {
    const { ui, store, commands, selection, shortcuts, layers, t } = ctx;

    layers.addSource(PREVIEW, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    layers.addLayer(
      {
        id: `${PREVIEW}-range`,
        type: 'line',
        source: PREVIEW,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        // Erase and follow: the stretch going away in red, the one replacing it in green.
        paint: { 'line-color': ['match', ['get', 'kind'], 'new', '#2f9e44', '#e03131'], 'line-width': 8, 'line-opacity': 0.6 },
      },
      'top',
    );
    layers.addLayer(
      {
        id: `${PREVIEW}-point`,
        type: 'circle',
        source: PREVIEW,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': ['case', ['==', ['get', 'tool'], ERASE_TOOL], '#e03131', '#ffffff'],
          'circle-stroke-color': '#212529',
          'circle-stroke-width': 2,
        },
      },
      'top',
    );
    const detach = new EditTools(ctx).attach();

    const selectedSegment = () => {
      const ids = selection.current;
      return ids.length === 1 ? store.get(ids[0]!, 'segment') : undefined;
    };
    /** Runs `fn` with the given (or selected) segment, or tells the user to select one. */
    const withSegment = (fn: (id: string) => void) => (id?: string) => {
      const target = id ?? selectedSegment()?.id;
      if (target) fn(target);
      else ui.notify(t('edit.selectFirst'));
    };
    const useTool = (tool: string) => () => {
      if (!selectedSegment()) return ui.notify(t('edit.selectFirst'));
      ui.toggleTool(tool);
    };

    const actions: EditActions = {
      split: useTool(SPLIT_TOOL),
      erase: useTool(ERASE_TOOL),
      follow: () => {
        if (!selectedSegment()) return ui.notify(t('edit.selectFirst'));
        const starting = get(ui.tool) !== FOLLOW_TOOL;
        ui.toggleTool(FOLLOW_TOOL);
        if (starting) ui.notify(t('edit.followHint'), 'info', 6000);
      },
      reverse: withSegment((id) => commands.run(reverseCommand(store, store.get(id, 'segment')!, t('cmd.reverse')))),
      duplicate: withSegment((id) => {
        const res = duplicateCommand(store, store.get(id, 'segment')!, {
          label: t('cmd.duplicate'),
          name: (name) => t('edit.copyName', { name }),
        });
        commands.run(res.command);
        selection.set([res.newId]);
      }),
      merge: withSegment((id) => {
        const seg = store.get(id, 'segment')!;
        const next = nextSegment(store, seg);
        if (!next) return ui.notify(t('edit.noNext'));
        if (next.mode !== seg.mode) ui.notify(t('edit.mergedModes', { mode: t(`mode.${seg.mode}`) }));
        fuseAction(ctx, [seg, next], seg.id);
      }),
      moveTo: (id, stageId) => {
        const cmd = moveToStageCommand(store, store.get(id, 'segment')!, stageId, t('cmd.moveSegment'));
        if (cmd) commands.run(cmd);
      },
      makeEditable: (id) => {
        const cmd = makeEditableCommand(store, store.get(id, 'segment')!, t('cmd.makeEditable'));
        if (cmd) commands.run(cmd);
      },
    };

    const removeMulti = ui.addMultiCard({ id: 'editing.multi', component: MultiCard, props: { ctx } });
    const removeCard = ui.addCardSection({ id: 'editing', component: EditCard, props: { ctx, actions }, types: ['segment'], order: 1 });
    const removeTools = [
      ui.addTool({
        id: SPLIT_TOOL,
        label: t('edit.split'),
        icon: icons.scissors,
        shortcut: KEYS.split,
        order: 20,
        active: derived(ui.tool, (tool) => tool === SPLIT_TOOL),
        run: actions.split,
      }),
      ui.addTool({
        id: ERASE_TOOL,
        label: t('edit.erase'),
        icon: icons.eraser,
        shortcut: KEYS.erase,
        order: 21,
        active: derived(ui.tool, (tool) => tool === ERASE_TOOL),
        run: actions.erase,
      }),
      ui.addTool({
        id: FOLLOW_TOOL,
        label: t('edit.follow'),
        icon: icons.follow,
        order: 22,
        keepSelection: true,
        active: derived(ui.tool, (tool) => tool === FOLLOW_TOOL),
        run: actions.follow,
      }),
    ];
    const offShortcuts = [
      shortcuts.add({ keys: KEYS.split, label: t('edit.split'), run: actions.split }),
      shortcuts.add({ keys: KEYS.erase, label: t('edit.erase'), run: actions.erase }),
      shortcuts.add({ keys: KEYS.reverse, label: t('edit.reverse'), run: () => actions.reverse() }),
      shortcuts.add({ keys: KEYS.duplicate, label: t('edit.duplicate'), run: () => actions.duplicate() }),
      shortcuts.add({ keys: KEYS.merge, label: t('edit.merge'), run: () => actions.merge() }),
      shortcuts.add({
        keys: KEYS.group,
        label: t('group.shortcut'),
        run: () => void groupSegmentsAction(ctx, selection.current.map((id) => store.get(id, 'segment')).filter((s) => !!s)),
      }),
    ];

    return () => {
      detach();
      removeCard();
      removeMulti();
      removeTools.forEach((off) => off());
      offShortcuts.forEach((off) => off());
    };
  },
});
