import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import HistoryDialog from './HistoryDialog.svelte';
import ItemHistory from './ItemHistory.svelte';

export default defineModule({
  id: 'history',
  setup(ctx) {
    const { ui, t } = ctx;
    const open = (focus: string | null = null) => ui.openDialog(HistoryDialog, { ctx, focus });
    const removers = [
      ui.addTool({ id: 'history', label: t('history.title'), icon: icons.history, shortcut: 'h', order: 70, run: () => open() }),
      ctx.shortcuts.add({ keys: 'h', label: t('history.title'), run: () => open() }),
      ui.addCardSection({ id: 'history.item', component: ItemHistory, props: { ctx, open }, order: 11 }),
    ];
    return () => removers.forEach((off) => off());
  },
});
