import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import BikeSetupView from './BikeSetupView.svelte';

export default defineModule({
  id: 'bike-setup',
  setup(ctx) {
    if (ctx.readOnly) return;
    return ctx.ui.addView({ id: 'bike', label: ctx.t('bike.open'), icon: icons.bike, component: BikeSetupView, props: { ctx }, order: 21 });
  },
});
