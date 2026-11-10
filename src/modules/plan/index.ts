import { defineModule } from '../../core/module';
import { icons } from '../../lib/icons';
import PlanView from './PlanView.svelte';

export default defineModule({
  id: 'plan',
  setup(ctx) {
    return ctx.ui.addView({ id: 'plan', label: ctx.t('plan.open'), icon: icons.calendar, component: PlanView, props: { ctx }, order: 10 });
  },
});
