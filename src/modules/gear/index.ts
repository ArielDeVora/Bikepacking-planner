import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import GearView from './GearView.svelte';

export default defineModule({
  id: 'gear',
  setup(ctx) {
    return ctx.ui.addView({ id: 'gear', label: ctx.t('gear.open'), icon: icons.backpack, component: GearView, props: { ctx }, order: 20 });
  },
});
